const { nanoid } = require("nanoid");
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");
const { cert } = require("firebase-admin/app");
const { DateUtil } = require("../../utils/dateUtils");
const du = new DateUtil("Asia/Makassar");

class PayrollService2 {
  constructor() {
    this._db = database.getConnection();
  }

  // --- Helpers ---------------------------------------------------------------

  _isYMD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  _toSeconds(timeStr) {
    if (!timeStr) return 0;
    const [h, m, s] = timeStr.split(":").map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
  }

  _dateStr(y, m, d = 1) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // Late penalty tiers (assumption: 41–60 => 25k)
  _latePenaltyFromMinutes(mins) {
    if (mins >= 5 && mins <= 10) return 5000;
    if (mins >= 11 && mins <= 30) return 10000;
    if (mins >= 31 && mins <= 60) return 25000;
    if (mins > 60) return 50000;
    return 0;
  }

  /**
   * Delete late-in deduction items from salary_details, then recalc totals.
   * Usage:
   *   await service.deleteLateDeductions(recordId)                          // all LATE_IN
   *   await service.deleteLateDeductions(recordId, { date: '2025-07-12' })  // only one date
   *   await service.deleteLateDeductions(recordId, { from: '2025-07-01', to: '2025-07-31' }) // range
   */
  async deleteLateDeductions(recordId, opts = {}) {
    const { date, from, to } = opts;

    if (date && !this._isYMD(date)) {
      throw new InvariantError("date must be YYYY-MM-DD");
    }
    if ((from || to) && (!this._isYMD(from) || !this._isYMD(to))) {
      throw new InvariantError("from/to must be YYYY-MM-DD");
    }

    let sql = `
    DELETE FROM salary_details
     WHERE record_id = ?
       AND type = 'deduction'
       AND code LIKE 'LATE_IN:%'
  `;
    const params = [recordId];

    if (date) {
      sql += ` AND code = ?`;
      params.push(`LATE_IN:${date}`);
    } else if (from && to) {
      // 'LATE_IN:' is 8 chars; the YYYY-MM-DD part starts at position 9 (1-based) and is 10 chars
      sql += ` AND SUBSTRING(code, 9, 10) BETWEEN ? AND ?`;
      params.push(from, to);
    }

    const [res] = await this._db.execute(sql, params);
    await this.recalcTotals(recordId);
    return { affected: res.affectedRows || 0 };
  }

  /**
   * (Optional) Delete early-checkout deduction items too, same patterns as above.
   */
  async deleteEarlyCheckoutDeductions(recordId, opts = {}) {
    const { date, from, to } = opts;

    if (date && !this._isYMD(date)) {
      throw new InvariantError("date must be YYYY-MM-DD");
    }
    if ((from || to) && (!this._isYMD(from) || !this._isYMD(to))) {
      throw new InvariantError("from/to must be YYYY-MM-DD");
    }

    let sql = `
    DELETE FROM salary_details
     WHERE record_id = ?
       AND type = 'deduction'
       AND code LIKE 'EARLY_OUT:%'
  `;
    const params = [recordId];

    if (date) {
      sql += ` AND code = ?`;
      params.push(`EARLY_OUT:${date}`);
    } else if (from && to) {
      sql += ` AND SUBSTRING(code, 10, 10) BETWEEN ? AND ?`; // 'EARLY_OUT:' is 10 chars
      params.push(from, to);
    }

    const [res] = await this._db.execute(sql, params);
    await this.recalcTotals(recordId);
    return { affected: res.affectedRows || 0 };
  }

  // by-date
  async deleteLateForDate(recordId, dateStr) {
    const code = `LATE_IN:${dateStr}`;
    const [rows] = await this._db.execute(
      `SELECT id FROM salary_details WHERE record_id=? AND code=?`,
      [recordId, code]
    );
    for (const r of rows) {
      await this.deleteItem(recordId, r.id);
    }
    return rows.length;
  }

  async deleteEarlyForDate(recordId, dateStr) {
    const code = `EARLY_OUT:${dateStr}`;
    const [rows] = await this._db.execute(
      `SELECT id FROM salary_details WHERE record_id=? AND code=?`,
      [recordId, code]
    );
    for (const r of rows) {
      await this.deleteItem(recordId, r.id);
    }
    return rows.length;
  }

  // bulk
  async deleteAllLate(recordId) {
    const [rows] = await this._db.execute(
      `SELECT id FROM salary_details WHERE record_id=? AND code LIKE 'LATE_IN:%'`,
      [recordId]
    );
    for (const r of rows) {
      await this.deleteItem(recordId, r.id);
    }
    return rows.length;
  }

  async deleteAllEarly(recordId) {
    const [rows] = await this._db.execute(
      `SELECT id FROM salary_details WHERE record_id=? AND code LIKE 'EARLY_OUT:%'`,
      [recordId]
    );
    for (const r of rows) {
      await this.deleteItem(recordId, r.id);
    }
    return rows.length;
  }

  // Calculate overtime hours from approved requests on a date
  async _overtimeHoursOnDate(user_id, dateStr) {
    const [rows] = await this._db.execute(
      `SELECT start_time, end_time
         FROM requests
        WHERE user_id = ?
          AND type='overtime'
          AND status='approved'
          AND request_date = ?`,
      [user_id, dateStr]
    );
    console.log(`query overtime for ${user_id} on ${dateStr}`);
    console.log(rows);
    let sec = 0;
    for (const r of rows) {
      if (!r.start_time || !r.end_time) continue;
      let a = this._toSeconds(r.start_time);
      let b = this._toSeconds(r.end_time);
      if (b < a) b += 24 * 3600; // across midnight
      sec += b - a;
    }
    return sec / 3600; // hours
  }

  // time_off approved on a date? (supports range with request_end_date)
  async _hasApprovedTimeOff(user_id, dateStr) {
    const [rows] = await this._db.execute(
      `SELECT 1
         FROM requests
        WHERE user_id = ?
          AND type='time_off'
          AND status='approved'
          AND ? BETWEEN request_date AND COALESCE(request_end_date, request_date)
        LIMIT 1`,
      [user_id, dateStr]
    );
    return rows.length > 0;
  }

  // get actual clock in/out for a date (prefer approved attendance_susulan if present)
  async _getActualInOut(user_id, dateStr) {
    // Try attendance_susulan approved first
    const [fix] = await this._db.execute(
      `SELECT checkin_time, checkout_time
         FROM attendance_susulan
        WHERE user_id = ?
          AND status='approved'
          AND attendance_date = ?
        ORDER BY id DESC
        LIMIT 1`,
      [user_id, dateStr]
    );
    if (fix.length) {
      const ci = fix[0].checkin_time
        ? `${dateStr} ${fix[0].checkin_time}`
        : null;
      const co = fix[0].checkout_time
        ? `${dateStr} ${fix[0].checkout_time}`
        : null;
      return { clock_in: ci, clock_out: co, source: "manual" };
    }

    // Else compute from attendances
    const [[cin]] = await this._db.execute(
      `SELECT recorded_at AS ts FROM attendances
        WHERE user_id = ? AND type='checkin' AND DATE(recorded_at) = ?
        ORDER BY recorded_at ASC LIMIT 1`,
      [user_id, dateStr]
    );
    const [[cout]] = await this._db.execute(
      `SELECT recorded_at AS ts FROM attendances
        WHERE user_id = ? AND type='checkout' AND DATE(recorded_at) = ?
        ORDER BY recorded_at DESC LIMIT 1`,
      [user_id, dateStr]
    );
    return {
      clock_in: cin ? cin.ts : null,
      clock_out: cout ? cout.ts : null,
      source: "raw",
    };
  }

  // Load monthly schedules joined with categories
  async _getMonthlySchedules(user_id, year, month) {
    const start = this._dateStr(year, month, 1);
    const end = this._dateStr(year, month, new Date(year, month, 0).getDate());

    const [rows] = await this._db.execute(
      `SELECT
        DATE_FORMAT(us.date, '%Y-%m-%d') AS date,
        sc.id   AS category_id,
        sc.name AS category_name,
        sc.time_start,
        sc.time_end
     FROM user_schedules us
     JOIN schedule_categories sc ON sc.id = us.category_id
     WHERE us.user_id = ?
       AND us.date BETWEEN ? AND ?
     ORDER BY us.date`,
      [user_id, start, end]
    );

    // Optional: normalisasi jam kalau driver kirim selain string
    return rows.map((r) => ({
      date: r.date, // sudah 'YYYY-MM-DD'
      category_id: r.category_id,
      category_name: r.category_name,
      time_start:
        typeof r.time_start === "string"
          ? r.time_start
          : String(r.time_start).slice(0, 8),
      time_end:
        typeof r.time_end === "string"
          ? r.time_end
          : String(r.time_end).slice(0, 8),
    }));
  }

  // Pull user + base salary
  async _getUser(user_id) {
    const [[u]] = await this._db.execute(
      `SELECT id, fullname, basic_salary, late_tolerance_id FROM users WHERE id = ? LIMIT 1`,
      [user_id]
    );
    if (!u) throw new InvariantError("User not found");
    return u;
  }

  // Load user components (allowances/deductions) with type
  async _getUserComponentValues(user_id) {
    const [rows] = await this._db.execute(
      `SELECT ucv.component_id, ucv.amount, pc.type, pc.name
         FROM user_component_values ucv
         JOIN payroll_components pc ON pc.id = ucv.component_id
        WHERE ucv.user_id = ?`,
      [user_id]
    );
    return rows; // [{component_id, amount, type:'earning'|'deduction', name}]
  }

  // async generateDraftForUser(user_id, year, month) {
  //   try {
  //     const user = await this._getUser(user_id);
  //     const schedules = await this._getMonthlySchedules(user_id, year, month);

  //     // Map schedules by date for quick lookup
  //     const scheduleMap = new Map();
  //     for (const s of schedules) {
  //       const key = s.date; // 'YYYY-MM-DD'
  //       const cat = (s.category_name || "").toLowerCase();
  //       const isDayOff = cat === "dayoff" || cat === "time off";

  //       // Prefer a working schedule over a dayoff schedule if duplicates exist
  //       const existing = scheduleMap.get(key);
  //       if (!existing || (existing._isDayOff && !isDayOff)) {
  //         scheduleMap.set(key, { ...s, _isDayOff: isDayOff });
  //       }
  //     }

  //     // Working days = scheduled, non-dayoff
  //     const workingDays = schedules.filter((s) => {
  //       const cat = (s.category_name || "").toLowerCase();
  //       return (
  //         cat !== "dayoff" &&
  //         cat !== "time off" &&
  //         cat !== "holiday" &&
  //         cat !== "manual attendance"
  //       );
  //     }).length;

  //     // Overtime rate rule
  //     const dailyRate = Number(user.basic_salary) / 30.0;
  //     const hourlyOvertimeRate = (dailyRate * 1.5) / 7.0;

  //     let presentDays = 0;
  //     let overtimeEarnings = 0;
  //     const details = [];

  //     const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based
  //     const pad2 = (n) => String(n).padStart(2, "0");
  //     const monthStr = pad2(month);

  //     for (let d = 1; d <= daysInMonth; d++) {
  //       const dateStr = `${year}-${monthStr}-${pad2(d)}`;
  //       const sch = scheduleMap.get(dateStr);
  //       const isWorkday = !!sch && !sch._isDayOff;

  //       // ---- Attendance + penalties only on scheduled working days ----
  //       if (isWorkday) {
  //         // Build scheduled in/out timestamps
  //         const scheduledInDt = `${dateStr} ${sch.time_start}`;
  //         const outBase = `${dateStr} ${sch.time_end}`;
  //         const scheduledOutDt =
  //           sch.time_end <= sch.time_start
  //             ? new Date(new Date(outBase).getTime() + 24 * 3600 * 1000) // overnight
  //             : new Date(outBase);

  //         // Actual in/out
  //         const { clock_in, clock_out } = await this._getActualInOut(
  //           user_id,
  //           dateStr
  //         );

  //         // Present = has in+out, or has approved time off
  //         let presentToday = false;
  //         if (clock_in && clock_out) {
  //           presentToday = true;
  //         } else {
  //           const hasTO = await this._hasApprovedTimeOff(user_id, dateStr);
  //           presentToday = hasTO;
  //         }
  //         if (presentToday) presentDays++;

  //         // Late check-in penalty
  //         if (clock_in) {
  //           const minsLate = Math.max(
  //             0,
  //             Math.round((new Date(clock_in) - new Date(scheduledInDt)) / 60000)
  //           );
  //           if (minsLate > 0) {
  //             const pen = this._latePenaltyFromMinutes(minsLate);
  //             details.push({
  //               code: `LATE_IN:${dateStr}`,
  //               label: `Late check-in ${dateStr} (${minsLate} mins)`,
  //               type: "deduction",
  //               quantity: 1,
  //               rate: 0,
  //               amount: pen,
  //               editable: 0,
  //               sort_order: 80,
  //             });
  //           }
  //         }

  //         // Early checkout penalty
  //         if (clock_out) {
  //           const minsEarly = Math.max(
  //             0,
  //             Math.round((scheduledOutDt - new Date(clock_out)) / 60000)
  //           );
  //           if (minsEarly > 0) {
  //             const pen = this._latePenaltyFromMinutes(minsEarly);
  //             details.push({
  //               code: `EARLY_OUT:${dateStr}`,
  //               label: `Early checkout ${dateStr} (${minsEarly} mins)`,
  //               type: "deduction",
  //               quantity: 1,
  //               rate: 0,
  //               amount: pen,
  //               editable: 0,
  //               sort_order: 81,
  //             });
  //           }
  //         }
  //       }

  //       // ---- OVERTIME: always check, even on days with no schedule or dayoff ----
  //       const otHours = await this._overtimeHoursOnDate(user_id, dateStr);
  //       if (otHours > 0) {
  //         overtimeEarnings += otHours * hourlyOvertimeRate;
  //       }
  //     }

  //     // Proration by scheduled working days
  //     const baseProrated =
  //       workingDays > 0
  //         ? Number(user.basic_salary) * (presentDays / workingDays)
  //         : 0;

  //     // User components (allowances/deductions)
  //     const comps = await this._getUserComponentValues(user_id);
  //     for (const c of comps) {
  //       const amt = Number(c.amount || 0);
  //       if (!amt) continue;
  //       details.push({
  //         code:
  //           c.type === "earning"
  //             ? `ALLOW:${c.component_id}`
  //             : `DEDUCT:${c.component_id}`,
  //         label: c.name,
  //         type: c.type, // 'earning' | 'deduction'
  //         quantity: 1,
  //         rate: 0,
  //         amount: amt,
  //         editable: 1,
  //         sort_order: c.type === "earning" ? 20 : 70,
  //       });
  //     }

  //     // Base line
  //     details.push({
  //       code: "BASE",
  //       label: "Basic Salary (Prorated by working days)",
  //       type: "earning",
  //       quantity: 1,
  //       rate: 0,
  //       amount: baseProrated,
  //       editable: 1,
  //       sort_order: 10,
  //     });

  //     // Monthly aggregated overtime line
  //     if (overtimeEarnings) {
  //       details.push({
  //         code: "OT",
  //         label: "Overtime",
  //         type: "earning",
  //         quantity: 1,
  //         rate: hourlyOvertimeRate,
  //         amount: overtimeEarnings,
  //         editable: 1,
  //         sort_order: 30,
  //       });
  //     }

  //     // Totals
  //     const gross = details
  //       .filter((d) => d.type === "earning")
  //       .reduce((s, d) => s + Number(d.amount || 0), 0);
  //     const ded = details
  //       .filter((d) => d.type === "deduction")
  //       .reduce((s, d) => s + Number(d.amount || 0), 0);
  //     const net = gross - ded;

  //     // Upsert header (unique by user_id+year+month)
  //     const id = nanoid(16);
  //     const sql = `
  //     INSERT INTO salary_records
  //         (id, user_id, year, month, status, basic_salary, working_days, present_days, gross_earn, total_ded, net_pay, meta_json)
  //     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, JSON_OBJECT('generator','payroll2','generated_at', NOW()))
  //     ON DUPLICATE KEY UPDATE
  //         status='draft',
  //         basic_salary = VALUES(basic_salary),
  //         working_days = VALUES(working_days),
  //         present_days = VALUES(present_days),
  //         gross_earn   = VALUES(gross_earn),
  //         total_ded    = VALUES(total_ded),
  //         net_pay      = VALUES(net_pay),
  //         updated_at   = CURRENT_TIMESTAMP
  //   `;

  //     await this._db.execute(sql, [
  //       id,
  //       user_id,
  //       year,
  //       month,
  //       user.basic_salary,
  //       workingDays,
  //       presentDays,
  //       gross,
  //       ded,
  //       net,
  //     ]);

  //     const [[rec]] = await this._db.execute(
  //       `SELECT id FROM salary_records WHERE user_id=? AND year=? AND month=? LIMIT 1`,
  //       [user_id, year, month]
  //     );
  //     const recordId = rec.id;

  //     // Replace details
  //     await this._db.execute(`DELETE FROM salary_details WHERE record_id=?`, [
  //       recordId,
  //     ]);

  //     const sqlDetail = `
  //     INSERT INTO salary_details (id, record_id, code, label, type, quantity, rate, amount, editable, sort_order)
  //     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  //   `;
  //     for (const d of details) {
  //       await this._db.execute(sqlDetail, [
  //         nanoid(16),
  //         recordId,
  //         d.code,
  //         d.label,
  //         d.type,
  //         d.quantity,
  //         d.rate,
  //         d.amount,
  //         d.editable,
  //         d.sort_order,
  //       ]);
  //     }

  //     return {
  //       recordId,
  //       summary: {
  //         workingDays,
  //         presentDays,
  //         gross,
  //         ded,
  //         net,
  //         overtimeEarnings,
  //         hourlyOvertimeRate,
  //       },
  //     };
  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }

  // Calculate overtime with itemized detail (no note column)
  async _overtimeOnDate(user_id, dateStr) {
    const [rows] = await this._db.execute(
      `SELECT id, start_time, end_time
       FROM requests
      WHERE user_id = ?
        AND type='overtime'
        AND status='approved'
        AND request_date = ?
      ORDER BY id ASC`,
      [user_id, dateStr]
    );

    let sec = 0;
    const items = [];
    for (const r of rows) {
      if (!r.start_time || !r.end_time) continue;
      let a = this._toSeconds(r.start_time);
      let b = this._toSeconds(r.end_time);
      if (b < a) b += 24 * 3600; // across midnight
      const durSec = b - a;
      sec += durSec;
      items.push({
        request_id: r.id,
        start_time: r.start_time,
        end_time: r.end_time,
        duration_hours: Math.round((durSec / 3600) * 100) / 100,
        note: null, // no note in schema
      });
    }

    return { hours: sec / 3600, items };
  }

  // Keep the old signature working (if used elsewhere)
  async _overtimeHoursOnDate(user_id, dateStr) {
    const { hours } = await this._overtimeOnDate(user_id, dateStr);
    return hours;
  }

  // async generateDraftForUser(user_id, year, month) {
  //   try {
  //     const user = await this._getUser(user_id);

  //     const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  //     // PERIODE: 26 (M-1) s.d. 25 (M), kalender lokal
  //     const { startStr, endStr } = du.getPayrollPeriod(year, month);

  //     // === Ambil jadwal untuk rentang periode ===
  //     const [prevYear, prevMonth] = startStr.split("-").map(Number); // 26 (M-1)
  //     const schedulesRaw = [
  //       ...(await this._getMonthlySchedules(user_id, prevYear, prevMonth)),
  //       ...(await this._getMonthlySchedules(user_id, year, month)),
  //     ];
  //     const schedules = schedulesRaw.filter(
  //       (s) => s.date >= startStr && s.date <= endStr
  //     );

  //     // === Map jadwal per tanggal (dedup, pilih kerja > dayoff) ===
  //     const scheduleMap = new Map();
  //     for (const s of schedules) {
  //       const key = s.date; // 'YYYY-MM-DD'
  //       const cat = (s.category_name || "").toLowerCase();
  //       const isDayOff =
  //         cat === "dayoff" ||
  //         cat === "time off" ||
  //         cat === "holiday" ||
  //         cat === "manual attendance" ||
  //         cat === "sick";

  //       const existing = scheduleMap.get(key);
  //       if (!existing || (existing._isDayOff && !isDayOff)) {
  //         scheduleMap.set(key, { ...s, _isDayOff: isDayOff });
  //       }
  //     }

  //     const workingDays = Array.from(scheduleMap.values()).filter(
  //       (v) => !v._isDayOff
  //     ).length;

  //     // === Tarif lembur (sesuai rule awal) ===
  //     const dailyRate = Number(user.basic_salary) / 30.0;
  //     const hourlyOvertimeRate = (dailyRate * 1.5) / 7.0;

  //     let presentDays = 0;
  //     let overtimeEarnings = 0;
  //     const details = [];

  //     // ---- AUDIT structure ----
  //     const audit = {
  //       period: { start: startStr, end: endStr },
  //       baseSalary: Number(user.basic_salary),
  //       hourlyOvertimeRate: round2(hourlyOvertimeRate),
  //       workingDays,
  //       presentDays: 0,
  //       absentDays: 0,
  //       absentDates: [],
  //       totals: {
  //         scheduledHours: 0,
  //         actualHours: 0,
  //         overtimeHours: 0,
  //         lateMinutes: 0,
  //         earlyMinutes: 0,
  //         lateDeduction: 0,
  //         earlyDeduction: 0,
  //       },
  //       components: { earning: 0, deduction: 0 },
  //       baseProration: { ratio: 0, amount: 0 },
  //       overtime: {
  //         // <=== NEW aggregated view for UI collapse
  //         hours: 0,
  //         amount: 0,
  //         byDate: [], // [{date, hours, amount, requests:[...]}]
  //       },
  //       perDay: [],
  //     };

  //     // === Loop tanggal periode (kalender Asia/Makassar) ===
  //     for (const dateStr of du.eachDateYMD(startStr, endStr)) {
  //       const sch = scheduleMap.get(dateStr);
  //       const isWorkday = !!sch && !sch._isDayOff;

  //       let scheduledHours = 0;
  //       let actualHours = 0;
  //       let lateMin = 0;
  //       let earlyMin = 0;
  //       let lateDed = 0;
  //       let earlyDed = 0;
  //       let otHours = 0;
  //       let otAmount = 0;
  //       let otRequests = [];

  //       let presentToday = false;
  //       let inISO = null;
  //       let outISO = null;
  //       let hasTO = false; // approved time off?

  //       if (isWorkday) {
  //         const scheduledInDt = du.parseInZone(dateStr, sch.time_start);
  //         let scheduledOutDt = du.parseInZone(dateStr, sch.time_end);
  //         if (sch.time_end <= sch.time_start) {
  //           scheduledOutDt = new Date(
  //             scheduledOutDt.getTime() + 24 * 60 * 60 * 1000
  //           );
  //         }
  //         scheduledHours = Math.max(
  //           0,
  //           (scheduledOutDt - scheduledInDt) / 3600000
  //         );
  //         audit.totals.scheduledHours += scheduledHours;

  //         const { clock_in, clock_out } = await this._getActualInOut(
  //           user_id,
  //           dateStr
  //         );
  //         const inDt = clock_in ? new Date(clock_in) : null;
  //         const outDt = clock_out ? new Date(clock_out) : null;
  //         inISO = inDt ? inDt.toISOString() : null;
  //         outISO = outDt ? outDt.toISOString() : null;

  //         if (inDt && outDt) {
  //           presentToday = true;
  //           actualHours = Math.max(0, (outDt - inDt) / 3600000);
  //           audit.totals.actualHours += actualHours;
  //         } else {
  //           hasTO = await this._hasApprovedTimeOff(user_id, dateStr);
  //           presentToday = !!hasTO;
  //         }
  //         if (presentToday) presentDays++;

  //         if (inDt) {
  //           lateMin = Math.max(0, du.diffMinutes(inDt, scheduledInDt));
  //           if (lateMin > 0) {
  //             lateDed = this._latePenaltyFromMinutes(lateMin);
  //             audit.totals.lateMinutes += lateMin;
  //             audit.totals.lateDeduction += lateDed;
  //             details.push({
  //               code: `LATE_IN:${dateStr}`,
  //               label: `Late check-in ${dateStr} (${lateMin} mins)`,
  //               type: "deduction",
  //               quantity: 1,
  //               rate: 0,
  //               amount: lateDed,
  //               editable: 0,
  //               sort_order: 80,
  //             });
  //           }
  //         }

  //         if (outDt) {
  //           earlyMin = Math.max(0, du.diffMinutes(scheduledOutDt, outDt));
  //           if (earlyMin > 0) {
  //             earlyDed = this._latePenaltyFromMinutes(earlyMin);
  //             audit.totals.earlyMinutes += earlyMin;
  //             audit.totals.earlyDeduction += earlyDed;
  //             details.push({
  //               code: `EARLY_OUT:${dateStr}`,
  //               label: `Early checkout ${dateStr} (${earlyMin} mins)`,
  //               type: "deduction",
  //               quantity: 1,
  //               rate: 0,
  //               amount: earlyDed,
  //               editable: 0,
  //               sort_order: 81,
  //             });
  //           }
  //         }

  //         if (!presentToday) {
  //           let reason = "no_attendance";
  //           if (!inDt && outDt) reason = "missing_checkin";
  //           if (inDt && !outDt) reason = "missing_checkout";
  //           audit.absentDates.push({
  //             date: dateStr,
  //             reason,
  //             schedule: {
  //               category: sch.category_name,
  //               time_start: sch.time_start,
  //               time_end: sch.time_end,
  //             },
  //             scheduledHours: round2(scheduledHours),
  //           });
  //         }
  //       }

  //       // ---- Lembur: itemized requests ----
  //       const ot = await this._overtimeOnDate(user_id, dateStr);
  //       otHours = ot.hours;
  //       otRequests = ot.items;
  //       if (otHours > 0) {
  //         otAmount = otHours * hourlyOvertimeRate;
  //         overtimeEarnings += otAmount;
  //         audit.totals.overtimeHours += otHours;

  //         audit.overtime.byDate.push({
  //           date: dateStr,
  //           hours: round2(otHours),
  //           amount: round2(otAmount),
  //           requests: otRequests.map((r) => ({
  //             id: r.request_id,
  //             start_time: r.start_time,
  //             end_time: r.end_time,
  //             duration_hours: round2(r.duration_hours),
  //             note: r.note,
  //           })),
  //         });
  //       }

  //       audit.perDay.push({
  //         date: dateStr,
  //         isWorkday,
  //         schedule: isWorkday
  //           ? {
  //               category: sch.category_name,
  //               time_start: sch.time_start,
  //               time_end: sch.time_end,
  //               scheduledHours: round2(scheduledHours),
  //             }
  //           : null,
  //         attendance: {
  //           clock_in: inISO,
  //           clock_out: outISO,
  //           present: presentToday,
  //           actualHours: round2(actualHours),
  //         },
  //         penalties: {
  //           lateMinutes: lateMin,
  //           lateDeduction: lateDed,
  //           earlyMinutes: earlyMin,
  //           earlyDeduction: earlyDed,
  //         },
  //         overtime: {
  //           hours: round2(otHours),
  //           amount: round2(otAmount),
  //           requests: otRequests.map((r) => ({
  //             id: r.request_id,
  //             start_time: r.start_time,
  //             end_time: r.end_time,
  //             duration_hours: round2(r.duration_hours),
  //             note: r.note,
  //           })),
  //         },
  //       });
  //     }

  //     //     // === Prorata base: basic_salary × (presentDays / workingDays) ===
  //     //     // const prorationRatio = workingDays > 0 ? presentDays / workingDays : 0;
  //     //     // const baseProrated =
  //     //     //   workingDays > 0 ? Number(user.basic_salary) * prorationRatio : 0;

  //     // === Base salary (TEMP: no proration) ===
  //     const prorationRatio = 1;
  //     const baseProrated = Number(user.basic_salary);

  //     // === Komponen user ===
  //     const comps = await this._getUserComponentValues(user_id);
  //     let compsEarning = 0;
  //     let compsDeduct = 0;

  //     for (const c of comps) {
  //       const amt = Number(c.amount || 0);
  //       if (!amt) continue;
  //       if (c.type === "earning") compsEarning += amt;
  //       if (c.type === "deduction") compsDeduct += amt;

  //       details.push({
  //         code:
  //           c.type === "earning"
  //             ? `ALLOW:${c.component_id}`
  //             : `DEDUCT:${c.component_id}`,
  //         label: c.name,
  //         type: c.type,
  //         quantity: 1,
  //         rate: 0,
  //         amount: amt,
  //         editable: 1,
  //         sort_order: c.type === "earning" ? 20 : 70,
  //       });
  //     }

  //     // === Baris gaji pokok ===
  //     details.push({
  //       code: "BASE",
  //       label: "Basic Salary",
  //       type: "earning",
  //       quantity: 1,
  //       rate: 0,
  //       amount: baseProrated,
  //       editable: 1,
  //       sort_order: 10,
  //     });

  //     // === Baris lembur agregat ===
  //     if (overtimeEarnings) {
  //       details.push({
  //         code: "OT",
  //         label: "Overtime",
  //         type: "earning",
  //         quantity: 1,
  //         rate: hourlyOvertimeRate,
  //         amount: overtimeEarnings,
  //         editable: 1,
  //         sort_order: 30,
  //       });
  //     }

  //     // === Totals ===
  //     const gross = details
  //       .filter((d) => d.type === "earning")
  //       .reduce((s, d) => s + Number(d.amount || 0), 0);
  //     const ded = details
  //       .filter((d) => d.type === "deduction")
  //       .reduce((s, d) => s + Number(d.amount || 0), 0);
  //     const net = gross - ded;

  //     // ---- Fill audit summary ----
  //     audit.presentDays = presentDays;
  //     audit.absentDays = audit.absentDates.length;
  //     audit.components = {
  //       earning: round2(compsEarning),
  //       deduction: round2(compsDeduct),
  //     };
  //     audit.baseProration = {
  //       ratio: Number(prorationRatio.toFixed(6)),
  //       amount: round2(baseProrated),
  //     };
  //     audit.overtime.hours = round2(audit.totals.overtimeHours);
  //     audit.overtime.amount = round2(overtimeEarnings);

  //     // console.log(
  //     //   [
  //     //     `PAYROLL_SUMMARY user=${user_id} period=${startStr}..${endStr}`,
  //     //     `workDays=${workingDays} present=${presentDays} absent=${audit.absentDays}`,
  //     //     `schedH=${round2(audit.totals.scheduledHours)}h actualH=${round2(
  //     //       audit.totals.actualHours
  //     //     )}h`,
  //     //     `late=${audit.totals.lateMinutes}m(-${round2(
  //     //       audit.totals.lateDeduction
  //     //     )})`,
  //     //     `early=${audit.totals.earlyMinutes}m(-${round2(
  //     //       audit.totals.earlyDeduction
  //     //     )})`,
  //     //     `OT=${round2(audit.totals.overtimeHours)}h @${round2(
  //     //       hourlyOvertimeRate
  //     //     )}/h = ${round2(overtimeEarnings)}`,
  //     //     `base=${round2(baseProrated)} gross=${round2(gross)} ded=${round2(
  //     //       ded
  //     //     )} net=${round2(net)}`,
  //     //   ].join(" | ")
  //     // );

  //     // === Upsert header (unchanged) ===
  //     const id = nanoid(16);
  //     const sql = `
  //           INSERT INTO salary_records
  //               (id, user_id, year, month, status, basic_salary, working_days, present_days, gross_earn, total_ded, net_pay, meta_json)
  //           VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, JSON_OBJECT(
  //               'generator','payroll2',
  //               'generated_at_utc', UTC_TIMESTAMP(),
  //               'period_start', ?,
  //               'period_end', ?,
  //               'audit_sched_hours', CAST(? AS CHAR),
  //               'audit_ot_hours', CAST(? AS CHAR),
  //               'audit_late_min', CAST(? AS CHAR),
  //               'audit_early_min', CAST(? AS CHAR),
  //               'overtime_by_date', JSON_EXTRACT(?, '$'),
  //               'hourly_ot_rate', ?
  //           ))
  //           ON DUPLICATE KEY UPDATE
  //               status='draft',
  //               basic_salary = VALUES(basic_salary),
  //               working_days = VALUES(working_days),
  //               present_days = VALUES(present_days),
  //               gross_earn   = VALUES(gross_earn),
  //               total_ded    = VALUES(total_ded),
  //               net_pay      = VALUES(net_pay),
  //               updated_at   = UTC_TIMESTAMP(),
  //               meta_json    = JSON_SET(
  //                 VALUES(meta_json),
  //                 '$.updated_at_utc', UTC_TIMESTAMP(),
  //                 '$.audit_sched_hours', CAST(? AS CHAR),
  //                 '$.audit_ot_hours', CAST(? AS CHAR),
  //                 '$.audit_late_min', CAST(? AS CHAR),
  //                 '$.audit_early_min', CAST(? AS CHAR),
  //                 '$.overtime_by_date', JSON_EXTRACT(?, '$'),
  //                 '$.hourly_ot_rate', ?
  //               )
  //         `;

  //     await this._db.execute(sql, [
  //       id,
  //       user_id,
  //       year,
  //       month,
  //       user.basic_salary,
  //       workingDays,
  //       presentDays,
  //       gross,
  //       ded,
  //       net,
  //       startStr,
  //       endStr,
  //       round2(audit.totals.scheduledHours),
  //       round2(audit.totals.overtimeHours),
  //       audit.totals.lateMinutes,
  //       audit.totals.earlyMinutes,
  //       JSON.stringify(audit.overtime.byDate), // <-- new
  //       audit.hourlyOvertimeRate, // <-- new
  //       // update values (repeat)
  //       round2(audit.totals.scheduledHours),
  //       round2(audit.totals.overtimeHours),
  //       audit.totals.lateMinutes,
  //       audit.totals.earlyMinutes,
  //       JSON.stringify(audit.overtime.byDate), // <-- new
  //       audit.hourlyOvertimeRate, // <-- new
  //     ]);

  //     const [[rec]] = await this._db.execute(
  //       `SELECT id FROM salary_records WHERE user_id=? AND year=? AND month=? LIMIT 1`,
  //       [user_id, year, month]
  //     );
  //     const recordId = rec.id;

  //     // === Replace details ===
  //     await this._db.execute(`DELETE FROM salary_details WHERE record_id=?`, [
  //       recordId,
  //     ]);
  //     const sqlDetail = `
  //       INSERT INTO salary_details (id, record_id, code, label, type, quantity, rate, amount, editable, sort_order)
  //       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  //     `;
  //     for (const d of details) {
  //       await this._db.execute(sqlDetail, [
  //         nanoid(16),
  //         recordId,
  //         d.code,
  //         d.label,
  //         d.type,
  //         d.quantity,
  //         d.rate,
  //         d.amount,
  //         d.editable,
  //         d.sort_order,
  //       ]);
  //     }

  //     return {
  //       recordId,
  //       summary: {
  //         workingDays,
  //         presentDays,
  //         gross,
  //         ded,
  //         net,
  //         overtimeEarnings,
  //         hourlyOvertimeRate,
  //         period: { start: startStr, end: endStr },
  //         audit, // includes absentDates[] and overtime.byDate with requests[]
  //       },
  //     };
  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }

  // async generateDraftForUser(user_id, year, month) {
  //   try {
  //     const user = await this._getUser(user_id);

  //     const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  //     // PERIODE: 26 (M-1) s.d. 25 (M), kalender lokal
  //     const { startStr, endStr } = du.getPayrollPeriod(year, month);

  //     // === Ambil jadwal untuk rentang periode ===
  //     const [prevYear, prevMonth] = startStr.split("-").map(Number); // 26 (M-1)
  //     const schedulesRaw = [
  //       ...(await this._getMonthlySchedules(user_id, prevYear, prevMonth)),
  //       ...(await this._getMonthlySchedules(user_id, year, month)),
  //     ];
  //     const schedules = schedulesRaw.filter(
  //       (s) => s.date >= startStr && s.date <= endStr
  //     );

  //     // === Map jadwal per tanggal (dedup, pilih kerja > dayoff) ===
  //     const scheduleMap = new Map();
  //     for (const s of schedules) {
  //       const key = s.date; // 'YYYY-MM-DD'
  //       const cat = (s.category_name || "").toLowerCase();
  //       const isDayOff =
  //         cat === "dayoff" ||
  //         cat === "time off" ||
  //         cat === "holiday" ||
  //         cat === "manual attendance" ||
  //         cat === "sick";

  //       const existing = scheduleMap.get(key);
  //       if (!existing || (existing._isDayOff && !isDayOff)) {
  //         scheduleMap.set(key, { ...s, _isDayOff: isDayOff });
  //       }
  //     }

  //     const workingDays = Array.from(scheduleMap.values()).filter(
  //       (v) => !v._isDayOff
  //     ).length;

  //     // === Tarif lembur (sesuai rule awal) ===
  //     const dailyRate = Number(user.basic_salary) / 30.0;
  //     const hourlyOvertimeRate = (dailyRate * 1.5) / 7.0;

  //     let presentDays = 0;
  //     let overtimeEarnings = 0;
  //     const details = [];

  //     // ---- AUDIT structure ----
  //     const audit = {
  //       period: { start: startStr, end: endStr },
  //       baseSalary: Number(user.basic_salary),
  //       hourlyOvertimeRate: round2(hourlyOvertimeRate),
  //       workingDays,
  //       presentDays: 0,
  //       absentDays: 0,
  //       absentDates: [], // <=== NEW: detailed list of absences
  //       totals: {
  //         scheduledHours: 0,
  //         actualHours: 0,
  //         overtimeHours: 0,
  //         lateMinutes: 0,
  //         earlyMinutes: 0,
  //         lateDeduction: 0,
  //         earlyDeduction: 0,
  //       },
  //       components: { earning: 0, deduction: 0 },
  //       baseProration: { ratio: 0, amount: 0 },
  //       overtime: { hours: 0, amount: 0 },
  //       perDay: [],
  //     };

  //     // === Loop tanggal periode (kalender Asia/Makassar) ===
  //     for (const dateStr of du.eachDateYMD(startStr, endStr)) {
  //       const sch = scheduleMap.get(dateStr);
  //       const isWorkday = !!sch && !sch._isDayOff;

  //       let scheduledHours = 0;
  //       let actualHours = 0;
  //       let lateMin = 0;
  //       let earlyMin = 0;
  //       let lateDed = 0;
  //       let earlyDed = 0;
  //       let otHours = 0;
  //       let otAmount = 0;

  //       let presentToday = false;
  //       let inISO = null;
  //       let outISO = null;

  //       // keep a flag to decide absence reason
  //       let hasTO = false; // approved time off?

  //       if (isWorkday) {
  //         const scheduledInDt = du.parseInZone(dateStr, sch.time_start);
  //         let scheduledOutDt = du.parseInZone(dateStr, sch.time_end);
  //         if (sch.time_end <= sch.time_start) {
  //           scheduledOutDt = new Date(
  //             scheduledOutDt.getTime() + 24 * 60 * 60 * 1000
  //           );
  //         }
  //         scheduledHours = Math.max(
  //           0,
  //           (scheduledOutDt - scheduledInDt) / 3600000
  //         );
  //         audit.totals.scheduledHours += scheduledHours;

  //         const { clock_in, clock_out } = await this._getActualInOut(
  //           user_id,
  //           dateStr
  //         );
  //         const inDt = clock_in ? new Date(clock_in) : null;
  //         const outDt = clock_out ? new Date(clock_out) : null;
  //         inISO = inDt ? inDt.toISOString() : null;
  //         outISO = outDt ? outDt.toISOString() : null;

  //         if (inDt && outDt) {
  //           presentToday = true;
  //           actualHours = Math.max(0, (outDt - inDt) / 3600000);
  //           audit.totals.actualHours += actualHours;
  //         } else {
  //           hasTO = await this._hasApprovedTimeOff(user_id, dateStr);
  //           presentToday = !!hasTO;
  //         }
  //         if (presentToday) presentDays++;

  //         if (inDt) {
  //           lateMin = Math.max(0, du.diffMinutes(inDt, scheduledInDt));
  //           if (lateMin > 0) {
  //             lateDed = this._latePenaltyFromMinutes(lateMin);
  //             audit.totals.lateMinutes += lateMin;
  //             audit.totals.lateDeduction += lateDed;
  //             details.push({
  //               code: `LATE_IN:${dateStr}`,
  //               label: `Late check-in ${dateStr} (${lateMin} mins)`,
  //               type: "deduction",
  //               quantity: 1,
  //               rate: 0,
  //               amount: lateDed,
  //               editable: 0,
  //               sort_order: 80,
  //             });
  //           }
  //         }

  //         if (outDt) {
  //           earlyMin = Math.max(0, du.diffMinutes(scheduledOutDt, outDt));
  //           if (earlyMin > 0) {
  //             earlyDed = this._latePenaltyFromMinutes(earlyMin);
  //             audit.totals.earlyMinutes += earlyMin;
  //             audit.totals.earlyDeduction += earlyDed;
  //             details.push({
  //               code: `EARLY_OUT:${dateStr}`,
  //               label: `Early checkout ${dateStr} (${earlyMin} mins)`,
  //               type: "deduction",
  //               quantity: 1,
  //               rate: 0,
  //               amount: earlyDed,
  //               editable: 0,
  //               sort_order: 81,
  //             });
  //           }
  //         }

  //         // NEW: mark absence if scheduled workday but not present & no time-off
  //         if (!presentToday) {
  //           let reason = "no_attendance"; // default
  //           if (!inDt && outDt) reason = "missing_checkin";
  //           if (inDt && !outDt) reason = "missing_checkout";
  //           if (!inDt && !outDt) reason = "no_attendance";
  //           // hasTO false here; if true, presentToday would be true
  //           audit.absentDates.push({
  //             date: dateStr,
  //             reason,
  //             schedule: {
  //               category: sch.category_name,
  //               time_start: sch.time_start,
  //               time_end: sch.time_end,
  //             },
  //             scheduledHours: round2(scheduledHours),
  //           });
  //         }
  //       }

  //       // ---- Lembur: dicek setiap hari ----
  //       otHours = await this._overtimeHoursOnDate(user_id, dateStr);
  //       if (otHours > 0) {
  //         otAmount = otHours * hourlyOvertimeRate;
  //         overtimeEarnings += otAmount;
  //         audit.totals.overtimeHours += otHours;
  //       }

  //       audit.perDay.push({
  //         date: dateStr,
  //         isWorkday,
  //         schedule: isWorkday
  //           ? {
  //               category: sch.category_name,
  //               time_start: sch.time_start,
  //               time_end: sch.time_end,
  //               scheduledHours: round2(scheduledHours),
  //             }
  //           : null,
  //         attendance: {
  //           clock_in: inISO,
  //           clock_out: outISO,
  //           present: presentToday,
  //           actualHours: round2(actualHours),
  //         },
  //         penalties: {
  //           lateMinutes: lateMin,
  //           lateDeduction: lateDed,
  //           earlyMinutes: earlyMin,
  //           earlyDeduction: earlyDed,
  //         },
  //         overtime: {
  //           hours: round2(otHours),
  //           amount: round2(otAmount),
  //         },
  //       });
  //     }

  //     // === Prorata base: basic_salary × (presentDays / workingDays) ===
  //     // const prorationRatio = workingDays > 0 ? presentDays / workingDays : 0;
  //     // const baseProrated =
  //     //   workingDays > 0 ? Number(user.basic_salary) * prorationRatio : 0;

  //     // TEMP: no proration — pay full basic salary
  //     const prorationRatio = 1;
  //     const baseProrated = Number(user.basic_salary);

  //     // === Komponen user (allowance/deduction) ===
  //     const comps = await this._getUserComponentValues(user_id);
  //     let compsEarning = 0;
  //     let compsDeduct = 0;

  //     for (const c of comps) {
  //       const amt = Number(c.amount || 0);
  //       if (!amt) continue;
  //       if (c.type === "earning") compsEarning += amt;
  //       if (c.type === "deduction") compsDeduct += amt;

  //       details.push({
  //         code:
  //           c.type === "earning"
  //             ? `ALLOW:${c.component_id}`
  //             : `DEDUCT:${c.component_id}`,
  //         label: c.name,
  //         type: c.type,
  //         quantity: 1,
  //         rate: 0,
  //         amount: amt,
  //         editable: 1,
  //         sort_order: c.type === "earning" ? 20 : 70,
  //       });
  //     }

  //     // === Baris gaji pokok (label tetap) ===
  //     details.push({
  //       code: "BASE",
  //       label: "Basic Salary (Prorated by working days)",
  //       type: "earning",
  //       quantity: 1,
  //       rate: 0,
  //       amount: baseProrated,
  //       editable: 1,
  //       sort_order: 10,
  //     });

  //     // === Baris lembur agregat ===
  //     if (overtimeEarnings) {
  //       details.push({
  //         code: "OT",
  //         label: "Overtime",
  //         type: "earning",
  //         quantity: 1,
  //         rate: hourlyOvertimeRate,
  //         amount: overtimeEarnings,
  //         editable: 1,
  //         sort_order: 30,
  //       });
  //     }

  //     // === Totals ===
  //     const gross = details
  //       .filter((d) => d.type === "earning")
  //       .reduce((s, d) => s + Number(d.amount || 0), 0);
  //     const ded = details
  //       .filter((d) => d.type === "deduction")
  //       .reduce((s, d) => s + Number(d.amount || 0), 0);
  //     const net = gross - ded;

  //     // ---- Fill audit summary ----
  //     audit.presentDays = presentDays;
  //     audit.absentDays = audit.absentDates.length; // <=== matches detailed list
  //     audit.components = {
  //       earning: round2(compsEarning),
  //       deduction: round2(compsDeduct),
  //     };
  //     audit.baseProration = {
  //       ratio: Number(prorationRatio.toFixed(6)),
  //       amount: round2(baseProrated),
  //     };
  //     audit.overtime = {
  //       hours: round2(audit.totals.overtimeHours),
  //       amount: round2(overtimeEarnings),
  //     };

  //     console.log(
  //       [
  //         `PAYROLL_SUMMARY user=${user_id} period=${startStr}..${endStr}`,
  //         `workDays=${workingDays} present=${presentDays} absent=${audit.absentDays}`,
  //         `schedH=${round2(audit.totals.scheduledHours)}h actualH=${round2(
  //           audit.totals.actualHours
  //         )}h`,
  //         `late=${audit.totals.lateMinutes}m(-${round2(
  //           audit.totals.lateDeduction
  //         )})`,
  //         `early=${audit.totals.earlyMinutes}m(-${round2(
  //           audit.totals.earlyDeduction
  //         )})`,
  //         `OT=${round2(audit.totals.overtimeHours)}h @${round2(
  //           hourlyOvertimeRate
  //         )}/h = ${round2(overtimeEarnings)}`,
  //         `proration=${presentDays}/${workingDays} → base=${round2(
  //           baseProrated
  //         )}`,
  //         `gross=${round2(gross)} ded=${round2(ded)} net=${round2(net)}`,
  //       ].join(" | ")
  //     );

  //     // === Upsert header ===
  //     const id = nanoid(16);
  //     const sql = `
  //       INSERT INTO salary_records
  //           (id, user_id, year, month, status, basic_salary, working_days, present_days, gross_earn, total_ded, net_pay, meta_json)
  //       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, JSON_OBJECT(
  //           'generator','payroll2',
  //           'generated_at_utc', UTC_TIMESTAMP(),
  //           'period_start', ?,
  //           'period_end', ?,
  //           'audit_sched_hours', CAST(? AS CHAR),
  //           'audit_ot_hours', CAST(? AS CHAR),
  //           'audit_late_min', CAST(? AS CHAR),
  //           'audit_early_min', CAST(? AS CHAR)
  //       ))
  //       ON DUPLICATE KEY UPDATE
  //           status='draft',
  //           basic_salary = VALUES(basic_salary),
  //           working_days = VALUES(working_days),
  //           present_days = VALUES(present_days),
  //           gross_earn   = VALUES(gross_earn),
  //           total_ded    = VALUES(total_ded),
  //           net_pay      = VALUES(net_pay),
  //           updated_at   = UTC_TIMESTAMP(),
  //           meta_json    = JSON_SET(
  //             VALUES(meta_json),
  //             '$.updated_at_utc', UTC_TIMESTAMP(),
  //             '$.audit_sched_hours', CAST(? AS CHAR),
  //             '$.audit_ot_hours', CAST(? AS CHAR),
  //             '$.audit_late_min', CAST(? AS CHAR),
  //             '$.audit_early_min', CAST(? AS CHAR)
  //           )
  //     `;

  //     await this._db.execute(sql, [
  //       id,
  //       user_id,
  //       year,
  //       month,
  //       user.basic_salary,
  //       workingDays,
  //       presentDays,
  //       gross,
  //       ded,
  //       net,
  //       startStr,
  //       endStr,
  //       round2(audit.totals.scheduledHours),
  //       round2(audit.totals.overtimeHours),
  //       audit.totals.lateMinutes,
  //       audit.totals.earlyMinutes,
  //       // update values
  //       round2(audit.totals.scheduledHours),
  //       round2(audit.totals.overtimeHours),
  //       audit.totals.lateMinutes,
  //       audit.totals.earlyMinutes,
  //     ]);

  //     const [[rec]] = await this._db.execute(
  //       `SELECT id FROM salary_records WHERE user_id=? AND year=? AND month=? LIMIT 1`,
  //       [user_id, year, month]
  //     );
  //     const recordId = rec.id;

  //     // === Replace details ===
  //     await this._db.execute(`DELETE FROM salary_details WHERE record_id=?`, [
  //       recordId,
  //     ]);
  //     const sqlDetail = `
  //       INSERT INTO salary_details (id, record_id, code, label, type, quantity, rate, amount, editable, sort_order)
  //       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  //     `;
  //     for (const d of details) {
  //       await this._db.execute(sqlDetail, [
  //         nanoid(16),
  //         recordId,
  //         d.code,
  //         d.label,
  //         d.type,
  //         d.quantity,
  //         d.rate,
  //         d.amount,
  //         d.editable,
  //         d.sort_order,
  //       ]);
  //     }

  //     return {
  //       recordId,
  //       summary: {
  //         workingDays,
  //         presentDays,
  //         gross,
  //         ded,
  //         net,
  //         overtimeEarnings,
  //         hourlyOvertimeRate,
  //         period: { start: startStr, end: endStr },
  //         audit, // includes absentDates[]
  //       },
  //     };
  //   } catch (error) {
  //     console.error(error);
  //     throw error;
  //   }
  // }

  /**
   * Get the (checkin, checkout) that belong to a scheduled window.
   * We search with a buffer around the window and pair the first checkout AFTER checkin.
   */
  // async _getActualInOutForSchedule(userId, dateStr, sch) {
  //   // Build scheduled window (handles overnight)
  //   const scheduledInDt = du.parseInZone(dateStr, sch.time_start);
  //   let scheduledOutDt = du.parseInZone(dateStr, sch.time_end);
  //   if (sch.time_end <= sch.time_start) {
  //     scheduledOutDt = new Date(scheduledOutDt.getTime() + 24 * 60 * 60 * 1000);
  //   }

  //   // Search window with buffer
  //   const beforeHours = 4;
  //   const afterHours = 6;
  //   const winStart = new Date(scheduledInDt.getTime() - beforeHours * 3600000);
  //   const winEnd = new Date(scheduledOutDt.getTime() + afterHours * 3600000);

  //   // 👇 Pass Date objects directly
  //   const [rows] = await this._db.execute(
  //     `
  //     SELECT type, recorded_at
  //     FROM attendances
  //     WHERE user_id = ?
  //       AND type IN ('checkin','checkout')
  //       AND recorded_at BETWEEN ? AND ?
  //     ORDER BY recorded_at ASC
  //   `,
  //     [userId, winStart, winEnd]
  //   );

  //   // Pair first checkin with first checkout AFTER it
  //   let inRow = null,
  //     outRow = null;
  //   for (const r of rows) {
  //     if (!inRow && r.type === "checkin") {
  //       inRow = r;
  //       continue;
  //     }
  //     if (inRow && r.type === "checkout") {
  //       if (
  //         new Date(r.recorded_at).getTime() >
  //         new Date(inRow.recorded_at).getTime()
  //       ) {
  //         outRow = r;
  //         break;
  //       }
  //     }
  //   }

  //   return {
  //     scheduledInDt,
  //     scheduledOutDt,
  //     clock_in: inRow ? inRow.recorded_at : null,
  //     clock_out: outRow ? outRow.recorded_at : null,
  //   };
  // }

  /**
   * Get the (checkin, checkout) that belong to a scheduled window.
   * - Build a window around the scheduled shift
   * - Among ALL checkins in the window, pick the one CLOSEST to scheduledIn
   *   (with a small early-bound), then pair with the first checkout after it.
   */
  // async _getActualInOutForSchedule(userId, dateStr, sch) {
  //   // Scheduled window (handles overnight)
  //   const scheduledInDt = du.parseInZone(dateStr, sch.time_start);
  //   let scheduledOutDt = du.parseInZone(dateStr, sch.time_end);
  //   if (sch.time_end <= sch.time_start) {
  //     scheduledOutDt = new Date(scheduledOutDt.getTime() + 24 * 60 * 60 * 1000);
  //   }

  //   // Search window with a buffer
  //   const beforeHours = 6; // a bit wider than before
  //   const afterHours = 8;
  //   const winStart = new Date(scheduledInDt.getTime() - beforeHours * 3600000);
  //   const winEnd = new Date(scheduledOutDt.getTime() + afterHours * 3600000);

  //   // NOTE: we still pass Date objects (as you already did). If your DB/driver TZ
  //   // handling is tricky, consider passing formatted strings in the SAME TZ your
  //   // data is stored. The pairing fix below already solves your false late case.
  //   const [rows] = await this._db.execute(
  //     `
  //     SELECT type, recorded_at
  //     FROM attendances
  //     WHERE user_id = ?
  //       AND type IN ('checkin','checkout')
  //       AND recorded_at BETWEEN ? AND ?
  //     ORDER BY recorded_at ASC
  //   `,
  //     [userId, winStart, winEnd]
  //   );

  //   // Split & normalize to Dates
  //   const toDate = (ts) => (ts instanceof Date ? ts : new Date(ts));
  //   const checkins = rows.filter((r) => r.type === "checkin");
  //   const checkouts = rows.filter((r) => r.type === "checkout");

  //   // --- Choose the check-in CLOSEST to scheduledIn (but not too early) ---
  //   const earlyBound = new Date(scheduledInDt.getTime() - 90 * 60000); // 90 min early bound
  //   let chosenIn = null;
  //   let bestAbs = Infinity;

  //   for (const r of checkins) {
  //     const t = toDate(r.recorded_at);
  //     if (t < earlyBound) continue; // ignore much-earlier taps
  //     const absDiff = Math.abs(t.getTime() - scheduledInDt.getTime());
  //     if (absDiff < bestAbs) {
  //       bestAbs = absDiff;
  //       chosenIn = r;
  //     }
  //   }

  //   // If nothing matched our bound, fallback to the last checkin in window
  //   if (!chosenIn && checkins.length) {
  //     chosenIn = checkins[checkins.length - 1];
  //   }

  //   // Pair with the first checkout AFTER chosen checkin
  //   let chosenOut = null;
  //   if (chosenIn) {
  //     const inTime = toDate(chosenIn.recorded_at).getTime();
  //     for (const r of checkouts) {
  //       const t = toDate(r.recorded_at).getTime();
  //       if (t > inTime) {
  //         chosenOut = r;
  //         break;
  //       }
  //     }
  //   }

  //   return {
  //     scheduledInDt,
  //     scheduledOutDt,
  //     clock_in: chosenIn ? chosenIn.recorded_at : null,
  //     clock_out: chosenOut ? chosenOut.recorded_at : null,
  //   };
  // }

  async _getActualInOutForSchedule(userId, dateStr, sch) {
    // 1) ambil jadwal default dari user_schedules
    let timeStart = sch.time_start; // contoh "08:00:00"
    let timeEnd = sch.time_end; // contoh "17:00:00"

    // 2) cek apakah ada shift_change approved utk tanggal ini
    const shiftChange = await this._getApprovedShiftChangeForDate(
      userId,
      dateStr
    );

    if (shiftChange) {
      if (shiftChange.start_time) timeStart = shiftChange.start_time;
      if (shiftChange.end_time) timeEnd = shiftChange.end_time;
    }

    // 3) Scheduled window (handles overnight) pakai waktu FINAL (bisa dari request, bisa dari sch)
    const scheduledInDt = du.parseInZone(dateStr, timeStart);
    let scheduledOutDt = du.parseInZone(dateStr, timeEnd);

    // kalau jam end lebih kecil/sama dari start, anggap lewat tengah malam
    if (timeEnd <= timeStart) {
      scheduledOutDt = new Date(scheduledOutDt.getTime() + 24 * 60 * 60 * 1000);
    }

    // 4) Search window with a buffer
    const beforeHours = 6; // a bit wider than before
    const afterHours = 8;
    const winStart = new Date(scheduledInDt.getTime() - beforeHours * 3600000);
    const winEnd = new Date(scheduledOutDt.getTime() + afterHours * 3600000);

    const [rows] = await this._db.execute(
      `
      SELECT type, recorded_at
      FROM attendances
      WHERE user_id = ?
        AND type IN ('checkin','checkout')
        AND recorded_at BETWEEN ? AND ?
      ORDER BY recorded_at ASC
    `,
      [userId, winStart, winEnd]
    );

    // Split & normalize to Dates
    const toDate = (ts) => (ts instanceof Date ? ts : new Date(ts));
    const checkins = rows.filter((r) => r.type === "checkin");
    const checkouts = rows.filter((r) => r.type === "checkout");

    // --- Choose the check-in CLOSEST to scheduledIn (but not too early) ---
    const earlyBound = new Date(scheduledInDt.getTime() - 90 * 60000); // 90 min early bound
    let chosenIn = null;
    let bestAbs = Infinity;

    for (const r of checkins) {
      const t = toDate(r.recorded_at);
      if (t < earlyBound) continue; // ignore much-earlier taps
      const absDiff = Math.abs(t.getTime() - scheduledInDt.getTime());
      if (absDiff < bestAbs) {
        bestAbs = absDiff;
        chosenIn = r;
      }
    }

    // If nothing matched our bound, fallback to the last checkin in window
    if (!chosenIn && checkins.length) {
      chosenIn = checkins[checkins.length - 1];
    }

    // Pair with the first checkout AFTER chosen checkin
    let chosenOut = null;
    if (chosenIn) {
      const inTime = toDate(chosenIn.recorded_at).getTime();
      for (const r of checkouts) {
        const t = toDate(r.recorded_at).getTime();
        if (t > inTime) {
          chosenOut = r;
          break;
        }
      }
    }

    return {
      scheduledInDt,
      scheduledOutDt,
      clock_in: chosenIn ? chosenIn.recorded_at : null,
      clock_out: chosenOut ? chosenOut.recorded_at : null,
    };
  }

  async generateDraftForUser(user_id, year, month) {
    try {
      const user = await this._getUser(user_id);

      const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

      // Payroll period: 26 (M-1) .. 25 (M)
      const { startStr, endStr } = du.getPayrollPeriod(year, month);

      // Schedules for prev + current month
      const [prevYear, prevMonth] = startStr.split("-").map(Number);
      const schedulesRaw = [
        ...(await this._getMonthlySchedules(user_id, prevYear, prevMonth)),
        ...(await this._getMonthlySchedules(user_id, year, month)),
      ];
      const schedules = schedulesRaw.filter(
        (s) => s.date >= startStr && s.date <= endStr
      );

      console.log(
        "RAW schedules for 2025-11-20:",
        schedules
          .filter((s) => s.date === "2025-11-20")
          .map((s) => ({
            date: s.date,
            category_name: s.category_name,
            category_id: s.category_id,
            source: s.source, // kalau kamu punya alias 'source' di _getMonthlySchedules
            schedule_id: s.id, // id dari user_schedules (kalau ada)
            request_id: s.request_id, // id dari requests (kalau ada)
          }))
      );

      // Pick 1 schedule per date (prefer workday over dayoff)
      // const scheduleMap = new Map();
      // for (const s of schedules) {
      //   const key = s.date;
      //   const cat = (s.category_name || "").toLowerCase();
      //   console.log(`schedule date=${key} category=${cat}`);
      //   const isDayOff =
      //     cat === "dayoff" ||
      //     cat === "time off" ||
      //     cat === "holiday" ||
      //     cat === "manual attendance" ||
      //     cat === "sick";

      //   const existing = scheduleMap.get(key);
      //   if (!existing || (existing._isDayOff && !isDayOff)) {
      //     scheduleMap.set(key, { ...s, _isDayOff: isDayOff });
      //   }
      // }

      const scheduleMap = new Map();

      for (const s of schedules) {
        const key = s.date;
        const cat = (s.category_name || "").toLowerCase();

        const isDayOff =
          cat === "dayoff" ||
          cat === "time off" ||
          cat === "holiday" ||
          cat === "manual attendance" ||
          cat === "sick";

        const existing = scheduleMap.get(key);

        if (!existing) {
          // pertama kali ketemu tanggal ini
          scheduleMap.set(key, { ...s, _isDayOff: isDayOff });
          continue;
        }

        // ✅ kalau yang lama sudah dayoff → jangan diganggu, dia tetap pemenang
        if (existing._isDayOff) {
          continue;
        }

        // ✅ kalau yang baru dayoff dan existing bukan → override, dayoff menang
        if (isDayOff) {
          scheduleMap.set(key, { ...s, _isDayOff: isDayOff });
          continue;
        }

        // ❕ selain itu (dua2nya bukan dayoff) → biarkan existing (atau kalau mau, boleh override,
        //   tapi itu tidak pengaruh ke penalty karena dua2nya tetap workday)
      }

      // (optional debug)
      for (const [date, s] of scheduleMap.entries()) {
        console.log(
          "FINAL schedule",
          date,
          "cat=",
          s.category_name,
          "isDayOff=",
          s._isDayOff
        );
      }

      const workingDays = Array.from(scheduleMap.values()).filter(
        (v) => !v._isDayOff
      ).length;

      // Overtime rule
      const dailyRate = Number(user.basic_salary) / 30.0;
      const hourlyOvertimeRate = (dailyRate * 1.5) / 7.0;

      // 🔹 Late tolerance (minutes) from DB
      const userLateToleranceMin = await this._getUserLateToleranceMinutes(
        user
      );

      console.log(`userLateToleranceMin=${userLateToleranceMin}`);

      let presentDays = 0;
      let overtimeEarnings = 0;
      const details = [];

      // ---- AUDIT structure ----
      const audit = {
        period: { start: startStr, end: endStr },
        baseSalary: Number(user.basic_salary),
        hourlyOvertimeRate: round2(hourlyOvertimeRate),
        workingDays,
        presentDays: 0,
        absentDays: 0,
        absentDates: [],
        totals: {
          scheduledHours: 0,
          actualHours: 0,
          overtimeHours: 0,
          // store both raw and penalized late mins
          lateMinutesRaw: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          lateDeduction: 0,
          earlyDeduction: 0,
        },
        components: { earning: 0, deduction: 0 },
        baseProration: { ratio: 0, amount: 0 },
        overtime: {
          hours: 0,
          amount: 0,
          byDate: [],
        },
        perDay: [],
      };

      // === Loop dates in period
      // === Loop dates in period
      for (const dateStr of du.eachDateYMD(startStr, endStr)) {
        const sch = scheduleMap.get(dateStr);
        const isWorkday = !!sch && !sch._isDayOff;

        let scheduledHours = 0;
        let actualHours = 0;
        let lateRaw = 0; // minutes late vs scheduled in (raw)
        let lateMin = 0; // effective late after tolerance
        let lateDed = 0;

        let earlyMin = 0; // minutes early vs scheduled out
        let earlyDed = 0;

        let otHours = 0;
        let otAmount = 0;
        let otRequests = [];

        let presentToday = false;
        let inISO = null;
        let outISO = null;
        let hasTO = false;

        if (isWorkday) {
          // 1) scheduled window + robust in/out pairing
          const { scheduledInDt, scheduledOutDt, clock_in, clock_out } =
            await this._getActualInOutForSchedule(user_id, dateStr, sch);

          scheduledHours = Math.max(
            0,
            (scheduledOutDt - scheduledInDt) / 3600000
          );
          audit.totals.scheduledHours += scheduledHours;

          const inDt = clock_in ? new Date(clock_in) : null;
          const outDt = clock_out ? new Date(clock_out) : null;
          inISO = inDt ? inDt.toISOString() : null;
          outISO = outDt ? outDt.toISOString() : null;

          // 2) present?
          if (inDt && outDt && outDt > inDt) {
            presentToday = true;
            actualHours = Math.max(0, (outDt - inDt) / 3600000);
            audit.totals.actualHours += actualHours;
          } else {
            hasTO = await this._hasApprovedTimeOff(user_id, dateStr);
            presentToday = !!hasTO;
          }
          if (presentToday) presentDays++;

          // // 3) Late check-in (with tolerance)
          // if (inDt) {
          //   lateRaw = Math.max(0, du.diffMinutes(inDt, scheduledInDt)); // in - scheduledIn
          //   lateMin = Math.max(0, lateRaw - userLateToleranceMin);

          //   // audit accumulators
          //   audit.totals.lateMinutesRaw += lateRaw;
          //   audit.totals.lateMinutes += lateMin;

          //   if (lateMin > 0) {
          //     lateDed = this._latePenaltyFromMinutes(lateMin);
          //     audit.totals.lateDeduction += lateDed;
          //     details.push({
          //       code: `LATE_IN:${dateStr}`,
          //       label: `Late check-in ${dateStr} (${lateMin} mins)`,
          //       type: "deduction",
          //       quantity: 1,
          //       rate: 0,
          //       amount: lateDed,
          //       editable: 0,
          //       sort_order: 80,
          //     });
          //   }
          // }

          // 3) Late check-in (with tolerance) — only if the check-in plausibly belongs to this shift
          if (inDt) {
            // Consider "in" valid for this schedule only if it's within
            // [scheduledIn - 90m, scheduledOut + 2h]
            const validForThisShift =
              inDt.getTime() >= scheduledInDt.getTime() - 90 * 60000 &&
              inDt.getTime() <= scheduledOutDt.getTime() + 2 * 3600000;

            if (validForThisShift) {
              lateRaw = Math.max(0, du.diffMinutes(inDt, scheduledInDt)); // in - scheduledIn
              lateMin = Math.max(0, lateRaw - userLateToleranceMin);

              // audit accumulators
              audit.totals.lateMinutesRaw += lateRaw;
              audit.totals.lateMinutes += lateMin;

              if (lateMin > 0) {
                const lateDed = this._latePenaltyFromMinutes(lateMin);
                audit.totals.lateDeduction += lateDed;
                details.push({
                  code: `LATE_IN:${dateStr}`,
                  label: `Late check-in ${dateStr} (${lateMin} mins)`,
                  type: "deduction",
                  quantity: 1,
                  rate: 0,
                  amount: lateDed,
                  editable: 0,
                  sort_order: 80,
                });
              }
            } else {
              // If it's far outside, treat as unrelated to this schedule (no late penalty here).
              // (You still keep present/absent logic below as-is.)
            }
          }

          // 4) Early checkout (only if we have a valid checkout after in)
          if (inDt && outDt && outDt > inDt) {
            earlyMin = Math.max(0, du.diffMinutes(scheduledOutDt, outDt)); // scheduledOut - out
            if (earlyMin > 0) {
              earlyDed = this._latePenaltyFromMinutes(earlyMin);
              audit.totals.earlyMinutes += earlyMin;
              audit.totals.earlyDeduction += earlyDed;
              details.push({
                code: `EARLY_OUT:${dateStr}`,
                label: `Early checkout ${dateStr} (${earlyMin} mins)`,
                type: "deduction",
                quantity: 1,
                rate: 0,
                amount: earlyDed,
                editable: 0,
                sort_order: 81,
              });
            }
          }

          // 5) Absent audit (not present and no time-off)
          if (!presentToday) {
            let reason = "no_attendance";
            if (!inDt && outDt) reason = "missing_checkin";
            if (inDt && !outDt) reason = "missing_checkout";
            audit.absentDates.push({
              date: dateStr,
              reason,
              schedule: {
                category: sch.category_name,
                time_start: sch.time_start,
                time_end: sch.time_end,
              },
              scheduledHours: round2(scheduledHours),
            });
          }
        }

        // 6) Overtime (unchanged)
        const ot = await this._overtimeOnDate(user_id, dateStr);
        otHours = ot.hours;
        otRequests = ot.items;
        if (otHours > 0) {
          otAmount = otHours * hourlyOvertimeRate;
          overtimeEarnings += otAmount;
          audit.totals.overtimeHours += otHours;

          audit.overtime.byDate.push({
            date: dateStr,
            hours: round2(otHours),
            amount: round2(otAmount),
            requests: otRequests.map((r) => ({
              id: r.request_id,
              start_time: r.start_time,
              end_time: r.end_time,
              duration_hours: round2(r.duration_hours),
              note: r.note,
            })),
          });
        }

        // 7) Per-day audit row
        audit.perDay.push({
          date: dateStr,
          isWorkday,
          schedule: isWorkday
            ? {
                category: sch.category_name,
                time_start: sch.time_start,
                time_end: sch.time_end,
                scheduledHours: round2(scheduledHours),
              }
            : null,
          attendance: {
            clock_in: inISO,
            clock_out: outISO,
            present: presentToday,
            actualHours: round2(actualHours),
          },
          penalties: {
            lateMinutesRaw: lateRaw,
            lateMinutes: lateMin,
            lateDeduction: lateDed,
            earlyMinutes: earlyMin,
            earlyDeduction: earlyDed,
          },
          overtime: {
            hours: round2(otHours),
            amount: round2(otAmount),
            requests: otRequests.map((r) => ({
              id: r.request_id,
              start_time: r.start_time,
              end_time: r.end_time,
              duration_hours: round2(r.duration_hours),
              note: r.note,
            })),
          },
        });
      }

      // Base salary (no proration for now)
      const prorationRatio = 1;
      const baseProrated = Number(user.basic_salary);

      // User components
      const comps = await this._getUserComponentValues(user_id);
      let compsEarning = 0;
      let compsDeduct = 0;

      for (const c of comps) {
        const amt = Number(c.amount || 0);
        if (!amt) continue;
        if (c.type === "earning") compsEarning += amt;
        if (c.type === "deduction") compsDeduct += amt;

        details.push({
          code:
            c.type === "earning"
              ? `ALLOW:${c.component_id}`
              : `DEDUCT:${c.component_id}`,
          label: c.name,
          type: c.type,
          quantity: 1,
          rate: 0,
          amount: amt,
          editable: 1,
          sort_order: c.type === "earning" ? 20 : 70,
        });
      }

      // Basic salary line
      details.push({
        code: "BASE",
        label: "Basic Salary",
        type: "earning",
        quantity: 1,
        rate: 0,
        amount: baseProrated,
        editable: 1,
        sort_order: 10,
      });

      // Aggregate overtime line
      if (overtimeEarnings) {
        details.push({
          code: "OT",
          label: "Overtime",
          type: "earning",
          quantity: 1,
          rate: hourlyOvertimeRate,
          amount: overtimeEarnings,
          editable: 1,
          sort_order: 30,
        });
      }

      // Totals
      const gross = details
        .filter((d) => d.type === "earning")
        .reduce((s, d) => s + Number(d.amount || 0), 0);
      const ded = details
        .filter((d) => d.type === "deduction")
        .reduce((s, d) => s + Number(d.amount || 0), 0);
      const net = gross - ded;

      // Fill audit summary
      audit.presentDays = presentDays;
      audit.absentDays = audit.absentDates.length;
      audit.components = {
        earning: round2(compsEarning),
        deduction: round2(compsDeduct),
      };
      audit.baseProration = {
        ratio: Number(prorationRatio.toFixed(6)),
        amount: round2(baseProrated),
      };
      audit.overtime.hours = round2(audit.totals.overtimeHours);
      audit.overtime.amount = round2(overtimeEarnings);

      // Upsert header
      const id = nanoid(16);
      const sql = `
      INSERT INTO salary_records
          (id, user_id, year, month, status, basic_salary, working_days, present_days, gross_earn, total_ded, net_pay, meta_json)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, JSON_OBJECT(
          'generator','payroll2',
          'generated_at_utc', UTC_TIMESTAMP(),
          'period_start', ?,
          'period_end', ?,
          'audit_sched_hours', CAST(? AS CHAR),
          'audit_ot_hours', CAST(? AS CHAR),
          'audit_late_min_raw', CAST(? AS CHAR),
          'audit_late_min', CAST(? AS CHAR),
          'audit_early_min', CAST(? AS CHAR),
          'overtime_by_date', JSON_EXTRACT(?, '$'),
          'hourly_ot_rate', ?
      ))
      ON DUPLICATE KEY UPDATE
          status='draft',
          basic_salary = VALUES(basic_salary),
          working_days = VALUES(working_days),
          present_days = VALUES(present_days),
          gross_earn   = VALUES(gross_earn),
          total_ded    = VALUES(total_ded),
          net_pay      = VALUES(net_pay),
          updated_at   = UTC_TIMESTAMP(),
          meta_json    = JSON_SET(
            VALUES(meta_json),
            '$.updated_at_utc', UTC_TIMESTAMP(),
            '$.audit_sched_hours', CAST(? AS CHAR),
            '$.audit_ot_hours', CAST(? AS CHAR),
            '$.audit_late_min_raw', CAST(? AS CHAR),
            '$.audit_late_min', CAST(? AS CHAR),
            '$.audit_early_min', CAST(? AS CHAR),
            '$.overtime_by_date', JSON_EXTRACT(?, '$'),
            '$.hourly_ot_rate', ?
          )
    `;

      await this._db.execute(sql, [
        id,
        user_id,
        year,
        month,
        user.basic_salary,
        workingDays,
        presentDays,
        gross,
        ded,
        net,
        startStr,
        endStr,
        round2(audit.totals.scheduledHours),
        round2(audit.totals.overtimeHours),
        audit.totals.lateMinutesRaw,
        audit.totals.lateMinutes,
        audit.totals.earlyMinutes,
        JSON.stringify(audit.overtime.byDate),
        audit.hourlyOvertimeRate,
        // update values
        round2(audit.totals.scheduledHours),
        round2(audit.totals.overtimeHours),
        audit.totals.lateMinutesRaw,
        audit.totals.lateMinutes,
        audit.totals.earlyMinutes,
        JSON.stringify(audit.overtime.byDate),
        audit.hourlyOvertimeRate,
      ]);

      const [[rec]] = await this._db.execute(
        `SELECT id FROM salary_records WHERE user_id=? AND year=? AND month=? LIMIT 1`,
        [user_id, year, month]
      );
      const recordId = rec.id;

      // Replace details
      await this._db.execute(`DELETE FROM salary_details WHERE record_id=?`, [
        recordId,
      ]);
      const sqlDetail = `
      INSERT INTO salary_details (id, record_id, code, label, type, quantity, rate, amount, editable, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
      for (const d of details) {
        await this._db.execute(sqlDetail, [
          nanoid(16),
          recordId,
          d.code,
          d.label,
          d.type,
          d.quantity,
          d.rate,
          d.amount,
          d.editable,
          d.sort_order,
        ]);
      }

      return {
        recordId,
        summary: {
          workingDays,
          presentDays,
          gross,
          ded,
          net,
          overtimeEarnings,
          hourlyOvertimeRate,
          period: { start: startStr, end: endStr },
          audit, // contains lateMinutesRaw & lateMinutes
        },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // Cek apakah ada shift_change approved di TANGGAL itu
  async _getApprovedShiftChangeForDate(userId, dateStr) {
    const [rows] = await this._db.execute(
      `
    SELECT start_time, end_time, request_date
    FROM requests
    WHERE user_id = ?
      AND type = 'shift_change'
      AND status = 'approved'
      AND request_date = ?
    ORDER BY id DESC
    LIMIT 1
    `,
      [userId, dateStr]
    );

    if (!rows || rows.length === 0) return null;
    return rows[0]; // { start_time, end_time, request_date }
  }

  // async _getActualInOutForSchedule(userId, dateStr, sch) {
  //   // 1) jadwal default dari user_schedules
  //   let scheduledStart = sch.time_start; // ex: "08:00:00"
  //   let scheduledEnd = sch.time_end; // ex: "17:00:00"

  //   // 2) cek shift_change approved untuk hari ini (berdasarkan request_date)
  //   const shiftChange = await this._getApprovedShiftChangeForDate(
  //     userId,
  //     dateStr
  //   );

  //   if (shiftChange && shiftChange.start_time && shiftChange.end_time) {
  //     // override jadwal dengan dari tabel requests
  //     scheduledStart = shiftChange.start_time;
  //     scheduledEnd = shiftChange.end_time;
  //   }

  //   // 3) convert ke Date object utk hitung jam, telat, dll
  //   const scheduledInDt = du.toDateTime(dateStr, scheduledStart);
  //   const scheduledOutDt = du.toDateTime(dateStr, scheduledEnd);

  //   // 4) ambil clock_in / clock_out seperti biasa
  //   const { clock_in, clock_out } = await this._getAttendanceForDate(
  //     userId,
  //     dateStr
  //   );

  //   return { scheduledInDt, scheduledOutDt, clock_in, clock_out };
  // }

  async generateDraftForAll(year, month) {
    try {
      const [users] = await this._db.execute(
        `SELECT id FROM users WHERE is_active = ?`,
        [1]
      );

      const out = {};
      for (const u of users) {
        try {
          const r = await this.generateDraftForUser(u.id, year, month);
          out[u.id] = r.recordId;
        } catch (e) {
          out[u.id] = `ERROR: ${e.message}`;
        }
      }
      return out;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  // --- Fetching --------------------------------------------------------------

  async getRecord(recordId) {
    const [[rec]] = await this._db.execute(
      `SELECT sr.*, u.fullname
       FROM salary_records sr
       JOIN users u ON sr.user_id = u.id
       WHERE sr.id=?`,
      [recordId]
    );
    if (!rec) throw new InvariantError("Record not found");

    const [items] = await this._db.execute(
      `SELECT * FROM salary_details WHERE record_id=? ORDER BY sort_order, created_at`,
      [recordId]
    );
    return { header: rec, items };
  }

  // Inside class PayrollService2

  /**
   * Get ONE salary record for a user (users.id).
   * If year/month (or period="YYYY-MM") is provided, fetch that specific period.
   * Otherwise, fetch the LATEST (by year DESC, month DESC).
   *
   * @param {string|number} userId
   * @param {Object} opts
   * @param {number} [opts.year]
   * @param {number|string} [opts.month] // number or zero-padded string is fine
   * @param {string} [opts.period]       // "YYYY-MM"
   * @param {string} [opts.status]       // optional: 'draft' | 'locked' | 'approved' | 'published' | 'all'
   * @returns {Promise<{header: object, items: object[]}>}
   */
  async getRecordByUserId(userId, opts = {}) {
    let { year, month, period, status = "all" } = opts;

    if (period && (!year || !month)) {
      const [yy, mm] = String(period).split("-");
      year = parseInt(yy, 10);
      month = parseInt(mm, 10);
    }

    const cond = [`sr.user_id = ?`];
    const vals = [userId];

    if (year) {
      cond.push(`sr.year = ?`);
      vals.push(year);
    }
    if (month) {
      cond.push(`sr.month = ?`);
      vals.push(month);
    }
    if (status && status !== "all") {
      cond.push(`sr.status = ?`);
      vals.push(status);
    }

    // If no specific period provided, pick the latest for the user
    const where = `WHERE ${cond.join(" AND ")}`;
    const sql = `
    SELECT sr.*
      FROM salary_records sr
      ${where}
      ORDER BY sr.year DESC, sr.month DESC
      LIMIT 1
  `;

    const [[rec]] = await this._db.execute(sql, vals);
    if (!rec) throw new InvariantError("Record not found for this user");

    const [items] = await this._db.execute(
      `SELECT * FROM salary_details WHERE record_id=? ORDER BY sort_order, created_at`,
      [rec.id]
    );

    return { header: rec, items };
  }

  /**
   * OPTIONAL: Get ALL salary records for a user (users.id), most-recent first.
   * Can be filtered by status and/or year/month/period.
   *
   * @param {string|number} userId
   * @param {Object} opts
   * @param {number} [opts.year]
   * @param {number|string} [opts.month]
   * @param {string} [opts.period]  // "YYYY-MM"
   * @param {string} [opts.status]  // 'all' (default) or specific status
   * @returns {Promise<object[]>}   // returns headers (no items)
   */
  async listRecordsByUserId(userId, opts = {}) {
    let { year, month, period, status = "all" } = opts;

    if (period && (!year || !month)) {
      const [yy, mm] = String(period).split("-");
      year = parseInt(yy, 10);
      month = parseInt(mm, 10);
    }

    const cond = [`sr.user_id = ?`];
    const vals = [userId];

    if (year) {
      cond.push(`sr.year = ?`);
      vals.push(year);
    }
    if (month) {
      cond.push(`sr.month = ?`);
      vals.push(month);
    }
    if (status && status !== "all") {
      cond.push(`sr.status = ?`);
      vals.push(status);
    }

    const where = `WHERE ${cond.join(" AND ")}`;
    const sql = `
    SELECT sr.*
      FROM salary_records sr
      ${where}
      ORDER BY sr.year DESC, sr.month DESC
  `;

    const [rows] = await this._db.execute(sql, vals);
    return rows;
  }

  // In your Payroll service
  async listRecords(params = {}) {
    let { year, month, period, status = "all", user_id } = params;

    // Support period=YYYY-MM
    if (period && (!year || !month)) {
      const [yy, mm] = period.split("-");
      year = parseInt(yy, 10);
      month = parseInt(mm, 10);
    }

    const cond = [];
    const vals = [];

    if (year) {
      cond.push(`sr.year = ?`);
      vals.push(year);
    }
    if (month) {
      cond.push(`sr.month = ?`);
      vals.push(month);
    }

    // Filter by user on the users table (avoid collate on parameter)
    if (user_id) {
      cond.push(`u.id = ?`);
      vals.push(user_id);
    }

    // Optional: status filter (skip if “all”)
    if (status && status !== "all") {
      cond.push(`sr.status = ?`);
      vals.push(status);
    }

    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    // Force both sides of the JOIN to the same collation
    const sql = `
    SELECT sr.*, u.fullname, u.username
      FROM salary_records sr
      JOIN users u
        ON (
          CONVERT(u.id USING utf8mb4) COLLATE utf8mb4_general_ci =
          CONVERT(sr.user_id USING utf8mb4) COLLATE utf8mb4_general_ci
        )
      ${where}
      ORDER BY sr.year DESC, sr.month DESC, u.fullname ASC
  `;

    const [rows] = await this._db.execute(sql, vals);
    return rows;
  }

  // --- Item editing ----------------------------------------------------------

  async addItem(
    recordId,
    {
      code = null,
      label,
      type,
      quantity = 1,
      rate = 0,
      amount,
      editable = 1,
      sort_order = 999,
    }
  ) {
    const id = nanoid(16);
    await this._db.execute(
      `INSERT INTO salary_details
         (id, record_id, code, label, type, quantity, rate, amount, editable, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        recordId,
        code,
        label,
        type,
        quantity,
        rate,
        amount,
        editable,
        sort_order,
      ]
    );
    await this.recalcTotals(recordId);
    return id;
  }

  async updateItem(recordId, itemId, payload) {
    const fields = [];
    const vals = [];
    for (const key of [
      "code",
      "label",
      "type",
      "quantity",
      "rate",
      "amount",
      "editable",
      "sort_order",
    ]) {
      if (payload[key] !== undefined) {
        fields.push(`${key} = ?`);
        vals.push(payload[key]);
      }
    }
    if (!fields.length) return;
    vals.push(recordId, itemId);
    await this._db.execute(
      `UPDATE salary_details SET ${fields.join(
        ", "
      )} WHERE record_id = ? AND id = ?`,
      vals
    );
    await this.recalcTotals(recordId);
  }

  async deleteItem(recordId, itemId) {
    await this._db.execute(
      `DELETE FROM salary_details WHERE record_id=? AND id=?`,
      [recordId, itemId]
    );
    await this.recalcTotals(recordId);
  }

  // --- Totals & status -------------------------------------------------------

  async recalcTotals(recordId) {
    const [[sum]] = await this._db.execute(
      `SELECT
          COALESCE(SUM(CASE WHEN type='earning'  THEN amount END),0) AS gross,
          COALESCE(SUM(CASE WHEN type='deduction' THEN amount END),0) AS ded
         FROM salary_details
        WHERE record_id = ?`,
      [recordId]
    );
    const gross = Number(sum.gross || 0);
    const ded = Number(sum.ded || 0);
    const net = gross - ded;

    await this._db.execute(
      `UPDATE salary_records SET gross_earn=?, total_ded=?, net_pay=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [gross, ded, net, recordId]
    );
    return { gross, ded, net };
  }

  async setStatus(recordId, status) {
    const allowed = ["draft", "locked", "approved", "published"];
    if (!allowed.includes(status)) throw new InvariantError("Invalid status");
    await this._db.execute(
      `UPDATE salary_records SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [status, recordId]
    );
  }

  /**
   * Get late tolerance minutes for a user.
   * Reads users.late_tolerance_id -> late_tolerances.minutes.
   * Returns 0 if not set, not found, or inactive.
   */
  async _getUserLateToleranceMinutes(user) {
    try {
      const tolId = Number(user?.late_tolerance_id || 0);
      if (!tolId) return 0;

      const [[row]] = await this._db.execute(
        `SELECT minutes
         FROM late_tolerances
        WHERE id = ? AND active = 1
        LIMIT 1`,
        [tolId]
      );

      const minutes = Number(row?.minutes ?? 0);
      // Optional debug — comment out after verifying:
      console.log(
        `[late_tolerance] user=${user?.id} tolId=${tolId} minutes=${minutes}`
      );
      return Number.isFinite(minutes) ? minutes : 0;
    } catch (e) {
      console.warn("late tolerance lookup failed; fallback to 0:", e?.message);
      return 0;
    }
  }

  // async _getUser(userId) {
  //   const [[row]] = await this._db.execute(
  //     `
  //   SELECT
  //     late_tolerance_id       -- ✅ include this
  //   FROM users
  //   WHERE id = ?
  //   LIMIT 1
  //   `,
  //     [userId]
  //   );
  //   return row;
  // }
}

module.exports = PayrollService2;
