const database = require("../../database");

/** ---------- Parsers ---------- */

/** Try to extract YYYY-MM-DD from code or label */
function extractDateFromDetail(code, label) {
  // Common patterns: "LATE_IN:2025-08-14", "LATE:2025-08-14"
  if (typeof code === "string") {
    const m = code.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (m) return m[1];
  }
  if (typeof label === "string") {
    const m = label.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (m) return m[1];
  }
  return null;
}

/** Extract "x mins" from label like "Late check-in 2025-08-14 (2 mins)" */
function extractLateMinutes(label, quantity, rate, amount) {
  if (typeof label === "string") {
    const m = label.match(/\((\d+)\s*mins?\)/i);
    if (m) return Number(m[1] || 0);
  }
  // fallback heuristics (in case label doesn’t contain minutes):
  const q = Number(quantity || 0);
  const r = Number(rate || 0);
  const a = Number(amount || 0);
  // If rate is "per-minute" and amount is present
  if (r > 0 && a > 0) {
    const computed = a / r;
    if (Number.isFinite(computed) && computed > 0) {
      return Math.round(computed);
    }
  }
  // If quantity actually stores minutes
  if (q > 0 && Number.isFinite(q)) {
    return Math.round(q);
  }
  return 0;
}

/** Check this detail is a Late item */
function isLateRow({ code, label, type }) {
  if ((type || "").toLowerCase() !== "deduction") return false;
  const c = String(code || "").toUpperCase();
  const l = String(label || "").toUpperCase();
  // Typical signals for lateness
  if (c.startsWith("LATE") || c.startsWith("LATE_IN")) return true;
  if (l.includes("LATE") && l.includes("CHECK")) return true; // "Late check-in ..."
  return false;
}

/** Numeric helper */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sort helper (numbers first) */
function sortItems(items, key, dir = "asc") {
  const mul = dir === "desc" ? -1 : 1;
  items.sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    const aNum = typeof av === "number" || !isNaN(Number(av));
    const bNum = typeof bv === "number" || !isNaN(Number(bv));
    if (aNum || bNum) return (num(av) - num(bv)) * mul;
    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
  return items;
}

class LateSummaryService {
  constructor() {
    this._db = database.getConnection();
  }

  /**
   * Monthly late summary from salary_details ONLY.
   * - Pulls rows where sd.type='deduction' and code/label indicate lateness.
   * - Groups per user (default) or per day.
   * - Returns minutes sum, count of late days, and total deduction (amount).
   *
   * @param {Object} opts
   * @param {number} opts.year
   * @param {number} opts.month
   * @param {string} [opts.status]  - exact status; else defaults to ('locked','approved','published')
   * @param {'user'|'day'} [opts.group='user']
   * @param {string} [opts.sortBy]  - e.g. 'late_minutes_total' | 'late_count' | 'late_nominal_total' | 'fullname' | 'date'
   * @param {'asc'|'desc'} [opts.sortDir='asc']
   */
  async getMonthlyLateSummary({
    year,
    month,
    status,
    group = "user",
    sortBy,
    sortDir = "asc",
  }) {
    if (!year || !month) {
      throw new Error("year and month are required");
    }

    const params = [year, month];
    let statusFilter = "";
    if (status) {
      statusFilter = " AND sr.status = ? ";
      params.push(status);
    } else {
      statusFilter = " AND sr.status IN ('locked','approved','published') ";
    }

    // Pull all details for the month; filter to "late" in code/label on the JS side for flexibility
    const sql = `
      SELECT
        sr.id AS record_id,
        sr.user_id,
        u.fullname,
        sr.year, sr.month, sr.status,
        sd.code, sd.label, sd.type,
        sd.quantity, sd.rate, sd.amount,
        sd.created_at
      FROM salary_records sr
      JOIN users u ON u.id = sr.user_id
      JOIN salary_details sd ON sd.record_id = sr.id
      WHERE sr.year = ? AND sr.month = ?
        ${statusFilter}
        AND sd.type = 'deduction'
        AND (
          UPPER(sd.code) LIKE 'LATE%' OR
          UPPER(sd.label) LIKE 'LATE%' OR
          UPPER(sd.label) LIKE '%LATE CHECK%'
        )
      ORDER BY u.fullname ASC, sd.created_at ASC
    `;

    const [rows] = await this._db.query(sql, params);

    // Aggregate
    const perUser = new Map();
    const perDay = new Map();

    for (const r of rows) {
      if (!isLateRow(r)) continue;

      const date = extractDateFromDetail(r.code, r.label);
      const minutes = extractLateMinutes(r.label, r.quantity, r.rate, r.amount);
      const nominal = num(r.amount);

      // group per-user
      if (!perUser.has(r.user_id)) {
        perUser.set(r.user_id, {
          user_id: r.user_id,
          fullname: r.fullname,
          late_count: 0,
          late_minutes_total: 0,
          late_nominal_total: 0,
          late_days: [], // {date, minutes, nominal, code, label}
        });
      }
      const U = perUser.get(r.user_id);
      U.late_count += 1;
      U.late_minutes_total += minutes;
      U.late_nominal_total += nominal;
      U.late_days.push({
        date,
        minutes,
        nominal,
        code: r.code,
        label: r.label,
      });

      // group per-day
      const key = date || "(no-date)";
      if (!perDay.has(key)) {
        perDay.set(key, {
          date: key,
          users_count: 0, // we’ll increment distinct users below
          late_count: 0,
          late_minutes_total: 0,
          late_nominal_total: 0,
          users_late: new Map(), // user_id -> { fullname, minutes, nominal }
        });
      }
      const D = perDay.get(key);
      D.late_count += 1;
      D.late_minutes_total += minutes;
      D.late_nominal_total += nominal;

      const userLate = D.users_late.get(r.user_id) || {
        fullname: r.fullname,
        minutes: 0,
        nominal: 0,
      };
      userLate.minutes += minutes;
      userLate.nominal += nominal;
      D.users_late.set(r.user_id, userLate);
    }

    // finalize per-day users_count and flatten users_late
    for (const D of perDay.values()) {
      D.users_count = D.users_late.size;
      D.users_late = Array.from(D.users_late, ([user_id, v]) => ({
        user_id,
        fullname: v.fullname,
        minutes: v.minutes,
        nominal: v.nominal,
      }));
    }

    // choose items by group
    let items =
      group === "day"
        ? Array.from(perDay.values())
        : Array.from(perUser.values());

    // computed key for “most deduction” sorting
    for (const it of items) {
      it.deduction_total = num(it.late_nominal_total); // here deduction == late nominal only
    }

    // default sort
    let defaultKey = group === "day" ? "date" : "fullname";
    sortItems(items, sortBy || defaultKey, sortDir);

    // totals
    const totals = items.reduce(
      (acc, it) => {
        if (group === "day") {
          acc.days += 1;
          acc.late_count += it.late_count || 0;
          acc.late_minutes_total += it.late_minutes_total || 0;
          acc.late_nominal_total += it.late_nominal_total || 0;
        } else {
          acc.users += 1;
          acc.late_count += it.late_count || 0;
          acc.late_minutes_total += it.late_minutes_total || 0;
          acc.late_nominal_total += it.late_nominal_total || 0;
        }
        return acc;
      },
      {
        users: 0,
        days: 0,
        late_count: 0,
        late_minutes_total: 0,
        late_nominal_total: 0,
      }
    );

    return {
      year,
      month,
      group,
      count: items.length,
      totals,
      items,
    };
  }
}

module.exports = LateSummaryService;
