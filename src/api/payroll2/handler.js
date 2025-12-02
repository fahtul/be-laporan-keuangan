const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");
const ExcelJS = require("exceljs");
const { PassThrough } = require("stream");

function formatMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Normalize labels for grouping (use label first; collapse datey late/early)
function normalizeItemLabelForSummary(labelRaw = "", codeRaw = "") {
  let L = String(labelRaw || "").trim();
  const C = String(codeRaw || "").trim();

  if (!L) L = C;

  // Collapse all variants to clean buckets
  if (/^OT$/i.test(C) || /overtime/i.test(L)) return "Overtime";
  if (/^late[_\s-]?in/i.test(L)) return "Late check-in";
  if (/^early[_\s-]?out/i.test(L)) return "Early checkout";

  // Strip technical prefixes like "ALLOW:" / "DEDUCT:"
  L = L.replace(/^(ALLOW|DEDUCT)\s*:\s*/i, "").trim();

  // Turn "Late check-in 2025-10-16 (35 mins)" → "Late check-in"
  L = L.replace(/\s+\d{4}-\d{2}-\d{2}.*$/i, "").trim();

  return L || C;
}

class PayrollHandler {
  constructor(service, usersService) {
    this._service = service;
    this._usersService = usersService;
    autoBind(this);
  }

  // -------------------- GENERATE --------------------
  async generateForUser(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { userId, year, month } = request.payload || {};
    if (!userId || !year || !month)
      throw new InvariantError("userId, year, month required");
    const data = await this._service.generateDraftForUser(
      userId,
      Number(year),
      Number(month)
    );
    return h.response({ status: "success", data }).code(201);
  }

  async generateForAll(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { year, month } = request.payload || {};
    if (!year || !month) throw new InvariantError("year, month required");
    const data = await this._service.generateDraftForAll(
      Number(year),
      Number(month)
    );
    return { status: "success", data };
  }

  // -------------------- LIST & DETAIL --------------------

  async listRecords(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { year, month, user_id } = request.query || {};
    const rows = await this._service.listRecords({
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      user_id,
    });
    return { status: "success", data: { records: rows } };
  }

  async getRecord(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const rec = await this._service.getRecord(id);
    return { status: "success", data: rec };
  }

  async getRecordOnlyUser(request) {
    const userId = request.auth.credentials.id;
    // Support optional query ?period=YYYY-MM or ?year=2025&month=8
    const { period, year, month, status } = request.query || {};
    const rec = await this._service.getRecordByUserId(userId, {
      period,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      status: status || "all",
    });
    return { status: "success", data: rec };
  }
  // -------------------- ITEMS (CRUD) --------------------

  async addItem(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params; // record id
    const { code, label, type, quantity, rate, amount, editable, sort_order } =
      request.payload || {};
    if (!label || !type || amount === undefined)
      throw new InvariantError("label, type, amount required");
    const itemId = await this._service.addItem(id, {
      code,
      label,
      type,
      quantity,
      rate,
      amount,
      editable,
      sort_order,
    });
    return h.response({ status: "success", data: { itemId } }).code(201);
  }

  async updateItem(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id, itemId } = request.params;
    await this._service.updateItem(id, itemId, request.payload || {});
    return { status: "success", message: "Item updated" };
  }

  async deleteItem(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id, itemId } = request.params;
    await this._service.deleteItem(id, itemId);
    return { status: "success", message: "Item deleted" };
  }

  // -------------------- TOTALS & STATUS --------------------

  async recalc(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const totals = await this._service.recalcTotals(id);
    return { status: "success", data: totals };
  }

  async setStatus(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const { status } = request.payload || {};
    await this._service.setStatus(id, status);
    return { status: "success", message: "Status updated" };
  }

  // ==================== EXCEL EXPORTS ====================

  /** GET /payroll/export/record/{id} */
  async exportRecord(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    try {
      const { id } = request.params;
      const rec = await this._service.getRecord(id); // { header, items }
      if (!rec) return h.response({ error: "not_found" }).code(404);

      const header = rec.header || {};
      const meta = normalizeMeta(header.meta_json);

      const records = [
        {
          header,
          items: rec.items || [],
          meta,
        },
      ];

      const wb = await buildWorkbook(records, {
        multi: false,
        year: header.year,
        month: header.month,
      });

      const buf = await wb.xlsx.writeBuffer();
      const filename = safeName(
        `payroll_${header.fullname || header.user_id || "user"}_${
          header.year
        }-${pad2(header.month)}.xlsx`
      );

      return h
        .response(buf)
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Cache-Control", "no-store, no-cache");
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  /** GET /payroll/export/period?year=YYYY&month=MM  (also supports period=YYYY-MM) */
  async exportPeriod(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    try {
      let { year, month, period } = request.query || {};

      // allow period=YYYY-MM too
      if ((!year || !month) && period) {
        const [yy, mm] = String(period).split("-");
        year = parseInt(yy, 10);
        month = parseInt(mm, 10);
      } else {
        year = parseInt(year, 10);
        month = parseInt(month, 10);
      }

      if (!year || !month) {
        return h.response({ error: "year_month_required" }).code(400);
      }

      // include all statuses so admin can export drafts too
      const headers = await this._service.listRecords({
        year,
        month,
        status: "all",
      });
      if (!headers || !headers.length) {
        // 204 = no content (lets FE show “no data” gracefully)
        return h.response().code(204);
      }

      // Build full records
      const records = [];
      for (const row of headers) {
        const full = await this._service.getRecord(row.id); // { header, items }
        const hdr = {
          ...(full.header || {}),
          username: row.username,
          fullname: row.fullname,
        };
        records.push({
          header: hdr,
          items: full.items || [],
          meta: normalizeMeta(hdr.meta_json),
        });
      }

      // Stream for big workbooks
      const wb = await buildWorkbook(records, { multi: true, year, month });
      const stream = new PassThrough();
      wb.xlsx.write(stream).then(() => stream.end());

      const filename = safeName(`payroll_all_${year}-${pad2(month)}.xlsx`);
      return h
        .response(stream)
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("Cache-Control", "no-store, no-cache");
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // --- helpers (local to handler) ---
  _isYMD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  /**
   * Bulk-delete late-in deductions (code LIKE 'LATE_IN:%') for a record.
   * Body can be:
   *  - {}                        → delete ALL late-in deductions
   *  - { date: 'YYYY-MM-DD' }    → delete one day
   *  - { from:'YYYY-MM-DD', to:'YYYY-MM-DD' } → delete range
   */
  async deleteLateDeductions(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const { date, from, to } = request.payload || {};

    if (date && !this._isYMD(date)) {
      throw new InvariantError("date must be YYYY-MM-DD");
    }
    if ((from || to) && (!this._isYMD(from) || !this._isYMD(to))) {
      throw new InvariantError("from/to must be YYYY-MM-DD");
    }
    if (date && (from || to)) {
      throw new InvariantError("Provide either date OR from+to OR nothing");
    }
    if ((from && !to) || (!from && to)) {
      throw new InvariantError("Both from and to must be provided");
    }

    const { affected } = await this._service.deleteLateDeductions(id, {
      date,
      from,
      to,
    });
    // service already recalcs totals; fetch latest numbers to return
    const totals = await this._service.recalcTotals(id);

    return { status: "success", data: { affected, totals } };
  }

  /**
   * Bulk-delete early-checkout deductions (code LIKE 'EARLY_OUT:%') for a record.
   * Same body contract as deleteLateDeductions.
   */
  async deleteEarlyCheckoutDeductions(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const { date, from, to } = request.payload || {};

    if (date && !this._isYMD(date)) {
      throw new InvariantError("date must be YYYY-MM-DD");
    }
    if ((from || to) && (!this._isYMD(from) || !this._isYMD(to))) {
      throw new InvariantError("from/to must be YYYY-MM-DD");
    }
    if (date && (from || to)) {
      throw new InvariantError("Provide either date OR from+to OR nothing");
    }
    if ((from && !to) || (!from && to)) {
      throw new InvariantError("Both from and to must be provided");
    }

    const { affected } = await this._service.deleteEarlyCheckoutDeductions(id, {
      date,
      from,
      to,
    });
    const totals = await this._service.recalcTotals(id);

    return { status: "success", data: { affected, totals } };
  }

  // Delete late (one date)
  async deleteLateForDate(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id, date } = request.params;
    const n = await this._service.deleteLateForDate(id, date);
    return { status: "success", data: { deleted: n } };
  }

  // Delete early (one date)
  async deleteEarlyForDate(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id, date } = request.params;
    const n = await this._service.deleteEarlyForDate(id, date);
    return { status: "success", data: { deleted: n } };
  }

  // Delete ALL late lines in record
  async deleteAllLate(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const n = await this._service.deleteAllLate(id);
    return { status: "success", data: { deleted: n } };
  }

  // Delete ALL early lines in record
  async deleteAllEarly(request) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const n = await this._service.deleteAllEarly(id);
    return { status: "success", data: { deleted: n } };
  }
}

module.exports = PayrollHandler;

// -------------------- helpers (local) --------------------

// Excel sheet name rules: max 31 chars, no : \ / ? * [ ]
const ILLEGAL_SHEET_CHARS = /[:\\/?*\[\]]/g;

function pad2(n) {
  return String(n).padStart(2, "0");
}
function safeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 100);
}
function num(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function normalizeMeta(metaJson) {
  let meta = {};
  try {
    meta = JSON.parse(metaJson || "{}") || {};
  } catch {
    meta = {};
  }
  let ot = meta.overtime_by_date ?? [];
  if (typeof ot === "string") {
    try {
      ot = JSON.parse(ot) || [];
    } catch {
      ot = [];
    }
  }
  meta.overtime_by_date = Array.isArray(ot) ? ot : [];
  meta.hourly_ot_rate = Number(meta.hourly_ot_rate || 0);
  return meta;
}

/**
 * Make a sheet name valid & unique within the workbook.
 * - strips illegal chars
 * - trims whitespace
 * - truncates to 31 chars
 * - appends " (2)", " (3)"... if name already used
 */
function uniqueSheetName(base, usedNames) {
  let name = String(base || "")
    .replace(ILLEGAL_SHEET_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) name = "Sheet";
  name = name.slice(0, 31);

  let final = name;
  let i = 2;
  while (usedNames.has(final)) {
    const suffix = ` (${i})`;
    final = name.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  usedNames.add(final);
  return final;
}

async function buildWorkbook(records, { multi, year, month }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Payroll Service";
  wb.created = new Date();

  // Track names we've used to prevent duplicates
  const usedNames = new Set();

  if (multi && records.length > 1) {
    addSummarySheet(wb, records, year, month, usedNames);
  }
  for (const rec of records) {
    addUserSheet(wb, rec, usedNames);
  }
  return wb;
}

// ===== replace your existing addSummarySheet with this one =====
function addSummarySheet(wb, records, year, month, usedNames) {
  const base = `Summary ${year}-${pad2(month)}`;
  const name = uniqueSheetName(base, usedNames);
  const ws = wb.addWorksheet(name);

  ws.columns = [
    { header: "Username", width: 20 },
    { header: "User", width: 28 },
    { header: "Period", width: 12 },
    // removed: Working Days, Present Days, Status
    { header: "Basic Salary", width: 16 },
    { header: "Gross", width: 14 },
    { header: "Deduction", width: 14 },
    { header: "Net", width: 14 },
    { header: "Earnings", width: 60 },
    { header: "Deductions", width: 60 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn(8).alignment = { wrapText: true }; // Earnings
  ws.getColumn(9).alignment = { wrapText: true }; // Deductions

  for (const r of records) {
    const h = r.header || {};
    const periodStr = `${h.year}-${pad2(h.month)}`;

    // aggregate by label (you already added helpers)
    const earn = new Map();
    const ded = new Map();
    for (const it of r.items || []) {
      const type = String(it.type || "").toLowerCase();
      const label = normalizeItemLabelForSummary(it.label ?? it.name, it.code);
      const amt = Number(it.amount || 0);
      if (type === "earning") earn.set(label, (earn.get(label) || 0) + amt);
      if (type === "deduction") ded.set(label, (ded.get(label) || 0) + amt);
    }
    const earningsText = Array.from(earn.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([l, a]) => `${l}: ${formatMoney(a)}`)
      .join("\n");
    const deductionsText = Array.from(ded.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([l, a]) => `${l}: ${formatMoney(a)}`)
      .join("\n");

    ws.addRow([
      h.username || "-",
      h.fullname || h.user_id || "-",
      periodStr,
      Number(h.basic_salary || 0),
      Number(h.gross_earn || 0),
      Number(h.total_ded || 0),
      Number(h.net_pay || 0),
      earningsText,
      deductionsText,
    ]);
  }
}

function addUserSheet(wb, record, usedNames) {
  const h = record.header || {};
  const items = record.items || [];
  const meta = record.meta || {};
  const ot = meta.overtime_by_date || [];

  const who = h.fullname || h.uesrname || h.user_id || "user";
  const base = `${who} ${h.year}-${pad2(h.month)}`;
  const title = uniqueSheetName(base, usedNames);

  const ws = wb.addWorksheet(title);

  // Top summary (removed Status row)
  ws.addRow(["Username", h.username || "-"]);
  ws.addRow(["User", h.fullname || h.user_id || "-"]);
  ws.addRow(["Period", `${h.year}-${pad2(h.month)}`]);
  ws.addRow([]); // spacer

  // Key/Value table (removed Working Days & Present Days)
  ws.addRow(["Key", "Value"]);
  ws.addRow(["Basic Salary", Number(h.basic_salary || 0)]);
  ws.addRow(["Gross", Number(h.gross_earn || 0)]);
  ws.addRow(["Deduction", Number(h.total_ded || 0)]);
  ws.addRow(["Net", Number(h.net_pay || 0)]);

  ws.getRow(1).font = { bold: true };
  ws.getRow(5).font = { bold: true }; // "Key / Value" header

  ws.addRow([]);

  // Items table
  const hdr = ws.addRow(["Code", "Label", "Type", "Qty", "Rate", "Amount"]);
  hdr.font = { bold: true };
  for (const it of items) {
    ws.addRow([
      it.code || "",
      it.label || it.name || "",
      it.type || "earning",
      Number(it.quantity || 1),
      Number(it.rate || 0),
      Number(it.amount || 0),
    ]);
  }

  // Overtime breakdown (unchanged)
  if (ot.length) {
    ws.addRow([]);
    const head = ws.addRow([
      "Overtime Date",
      "Hours",
      "Amount",
      "Requests (start-end, hours, note)",
    ]);
    head.font = { bold: true };

    for (const d of ot) {
      const reqs = Array.isArray(d.requests) ? d.requests : [];
      if (!reqs.length) {
        ws.addRow([d.date || "-", num(d.hours), num(d.amount), "-"]);
      } else {
        const [first, ...rest] = reqs;
        ws.addRow([d.date || "-", num(d.hours), num(d.amount), fmtReq(first)]);
        for (const r of rest) ws.addRow(["", "", "", fmtReq(r)]);
      }
    }
  }

  // Column widths & number formats
  ws.columns = [
    { width: 22 },
    { width: 40 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
  ];
  ws.eachRow((row) => {
    [5, 6].forEach((cIdx) => {
      const cell = row.getCell(cIdx);
      if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
    });
  });
}

function fmtReq(r) {
  const st = r?.start_time ?? "?";
  const et = r?.end_time ?? "?";
  const dh = num(r?.duration_hours ?? 0);
  const note = (r?.note || "").toString().trim();
  return note ? `${st}–${et} (${dh} h) — ${note}` : `${st}–${et} (${dh} h)`;
}
