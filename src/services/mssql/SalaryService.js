// src/services/mssql/SalaryService.js
const { nanoid } = require("nanoid");
const database = require("../../database");
const UsersService = require("./UsersService");
const ExcelJS = require("exceljs");

class SalaryService {
  constructor() {
    this._db = database.getConnection();
    this._usersService = new UsersService();
  }

  // Helper: konversi "HH:MM:SS" → detik
  _toSeconds(timeStr) {
    const [h, m, s] = timeStr.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  }

  _hhmmssUTC(dateObj) {
    const hh = String(dateObj.getUTCHours()).padStart(2, "0");
    const mm = String(dateObj.getUTCMinutes()).padStart(2, "0");
    const ss = String(dateObj.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  /**
   * Hitung & simpan gaji bulanan
   * @param {string} user_id
   * @param {number} year
   * @param {number} month (1–12)
   */
  async calculateAndSaveMonthly(user_id, year, month) {
    // 1) Basic salary
    const basicSalary = await this._usersService.getBasicSalary(user_id);

    // 2) Overtime rates
    const dailyRate = basicSalary / 30;
    const shiftOvertime = dailyRate * 1.5;
    const hourlyOvertimeRate = shiftOvertime / 7;

    // 3) Date range for the month
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(
      year,
      month,
      0
    ).getDate()}`;

    // 4) Fetch schedules + category
    const [schedules] = await this._db.execute(
      `SELECT us.date, us.category_id, sc.time_start, sc.time_end
       FROM user_schedules us
       JOIN schedule_categories sc
         ON sc.id = us.category_id
      WHERE us.user_id = ? AND us.date BETWEEN ? AND ?`,
      [user_id, startDate, endDate]
    );

    let presentDays = 0;
    let penaltyCount = 0;
    let overtimeEarnings = 0;

    // 5) Start detail array with BASIC
    const details = [["BASIC", "Basic Salary", basicSalary]];

    for (const sch of schedules) {
      const dateStr = sch.date.toISOString().slice(0, 10);
      console.log(`sch ${sch.category_id}`);
      // 5a) Holiday & Time Off → full pay
      if (
        sch.category_id === "cat-holiday" ||
        sch.category_id === "cat-time_off" ||
        sch.category_id === "cat-manual"
      ) {
        presentDays++;
        continue;
      }

      // 5b) Manual Attendance → full pay
      if (sch.category_id === "cat-manual") {
        presentDays++;
        continue;
      }

      // 5c) Normal attendance: check in/out
      const [inRows] = await this._db.execute(
        `SELECT recorded_at FROM attendances
         WHERE user_id = ? AND type = 'checkin' AND DATE(recorded_at) = ?
        ORDER BY recorded_at ASC LIMIT 1`,
        [user_id, dateStr]
      );
      const [outRows] = await this._db.execute(
        `SELECT recorded_at FROM attendances
         WHERE user_id = ? AND type = 'checkout' AND DATE(recorded_at) = ?
        ORDER BY recorded_at DESC LIMIT 1`,
        [user_id, dateStr]
      );
      if (!inRows.length || !outRows.length) {
        // absent
        continue;
      }
      presentDays++;

      // 5d) Penalty late / early
      const checkInTime = this._hhmmssUTC(inRows[0].recorded_at);
      const checkOutTime = this._hhmmssUTC(outRows[0].recorded_at);
      if (checkInTime > sch.time_start) penaltyCount++;
      if (checkOutTime < sch.time_end) penaltyCount++;

      // 5e) Approved overtime?
      const [otRows] = await this._db.execute(
        `SELECT start_time, end_time FROM requests
         WHERE user_id = ? AND request_date = ? 
           AND type = 'overtime' AND status = 'approved'
        LIMIT 1`,
        [user_id, dateStr]
      );
      if (otRows.length) {
        let secStart = this._toSeconds(otRows[0].start_time);
        let secEnd = this._toSeconds(otRows[0].end_time);
        let diffSec = secEnd - secStart;
        if (diffSec < 0) diffSec += 24 * 3600; // across midnight
        const hours = diffSec / 3600;
        overtimeEarnings += hours * hourlyOvertimeRate;
      }
    }

    console.log(
      `Present days: ${presentDays}, Penalties: ${penaltyCount}, Overtime earnings: ${overtimeEarnings}`
    );

    // 6) Penalties & absence deductions
    const rawPenalty = basicSalary * 0.02 * penaltyCount;
    const penaltyAmount = Math.min(rawPenalty, basicSalary * 0.2);
    const totalDays = schedules.length;
    const absentDays = totalDays - presentDays;
    const absenceDeduction = absentDays * (basicSalary / totalDays);

    if (penaltyAmount)
      details.push(["DEDP:PN", "Penalty Late/Early", -penaltyAmount]);
    if (absenceDeduction)
      details.push(["DEDP:AB", "Absence Deduction", -absenceDeduction]);

    // 7) Other payroll components
    const [compRows] = await this._db.execute(
      `SELECT pc.id AS component_id, pc.type, ucv.amount
       FROM user_component_values ucv
       JOIN payroll_components pc ON pc.id = ucv.component_id
      WHERE ucv.user_id = ?`,
      [user_id]
    );
    let otherEarnings = 0;
    let otherDeductions = 0;
    for (const v of compRows) {
      const amt = parseFloat(v.amount);
      if (v.type === "earning") {
        otherEarnings += amt;
        details.push([`COMP:+${v.component_id}`, "Allowance", amt]);
      } else {
        otherDeductions += amt;
        details.push([`COMP:-${v.component_id}`, "Deduction", -amt]);
      }
    }

    // 8) Overtime earnings
    if (overtimeEarnings) {
      details.push(["EARN:OT", "Overtime Earnings", overtimeEarnings]);
    }

    // 9) Total salary
    const totalSalary =
      basicSalary +
      otherEarnings +
      overtimeEarnings -
      (penaltyAmount + absenceDeduction + otherDeductions);

    // 10) Persist header with upsert on the unique user+period key
    //    Assumes salary_records has a UNIQUE constraint ux_user_period(user_id,year,month)
    const recordId = nanoid(16);
    await this._db.execute(
      `
    INSERT INTO salary_records
      (id, user_id, year, month, basic_salary, total_salary)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      basic_salary = VALUES(basic_salary),
      total_salary = VALUES(total_salary),
      id = id
    `,
      [recordId, user_id, year, month, basicSalary, totalSalary]
    );
    // If the row already existed, its id stays the old one; if new, we use our generated id.
    // To know which id to use for details, fetch it back:
    const [[{ id: finalRecordId }]] = await this._db.execute(
      `SELECT id FROM salary_records WHERE user_id = ? AND year = ? AND month = ?`,
      [user_id, year, month]
    );

    // 11) Delete any existing details for that record
    await this._db.execute(`DELETE FROM salary_details WHERE record_id = ?`, [
      finalRecordId,
    ]);

    // 12) Persist new breakdown details
    const sqlDetail = `
    INSERT INTO salary_details
      (id, record_id, code, description, amount)
    VALUES (?, ?, ?, ?, ?)`;
    for (const [code, desc, amt] of details) {
      await this._db.execute(sqlDetail, [
        nanoid(16),
        finalRecordId,
        code,
        desc,
        amt,
      ]);
    }

    return { recordId: finalRecordId, totalSalary };
  }

  /**
   * Ambil histori gaji
   */
  async getHistory(user_id) {
    // 1) Load salary record headers
    const [records] = await this._db.execute(
      `SELECT id, year, month, basic_salary, total_salary, created_at
       FROM salary_records
      WHERE user_id = ?
      ORDER BY year DESC, month DESC`,
      [user_id]
    );

    // 2) For each record, load details *and* join to payroll_components for COMP codes
    for (const rec of records) {
      const [details] = await this._db.execute(
        `
      SELECT
        sd.code,
        sd.description,
        sd.amount,
        pc.name AS component_name
      FROM salary_details AS sd
      LEFT JOIN payroll_components AS pc
        ON (
          -- only component entries have codes like COMP:+<id> or COMP:-<id>
          (sd.code LIKE 'COMP:+%'   AND pc.id = SUBSTR(sd.code, 7))
       OR (sd.code LIKE 'COMP:-%'   AND pc.id = SUBSTR(sd.code, 7))
        )
      WHERE sd.record_id = ?
      ORDER BY sd.code
      `,
        [rec.id]
      );
      rec.details = details;
    }

    return records;
  }

  /**
   * Get the salary history for *all* users.
   * @returns {Promise<Object<string, Array>>}
   *   An object where keys are user_ids and values are their history arrays.
   */
  async getAllHistory() {
    // 1) Load all records + user full name
    const [records] = await this._db.execute(`
      SELECT
        sr.id,
        sr.user_id,
        u.fullname,
        sr.year,
        sr.month,
        sr.basic_salary,
        sr.total_salary,
        sr.created_at
      FROM salary_records AS sr
      JOIN users AS u
        ON sr.user_id = u.id
      ORDER BY sr.user_id, sr.year DESC, sr.month DESC
    `);

    // 2) Load all details
    const [details] = await this._db.execute(`
      SELECT record_id, code, description, amount
      FROM salary_details
      ORDER BY record_id, code
    `);

    // 3) Group details by record_id
    const detailMap = details.reduce((map, d) => {
      (map[d.record_id] = map[d.record_id] || []).push({
        code: d.code,
        description: d.description,
        amount: d.amount,
      });
      return map;
    }, {});

    // 4) Build per-user histories, now including fullname
    return records.reduce((users, rec) => {
      const row = {
        id: rec.id,
        year: rec.year,
        month: rec.month,
        basicSalary: rec.basic_salary,
        totalSalary: rec.total_salary,
        createdAt: rec.created_at,
        fullname: rec.fullname, // ← user’s name
        details: detailMap[rec.id] || [],
      };
      (users[rec.user_id] = users[rec.user_id] || []).push(row);
      return users;
    }, {});
  }

  /**
   * Run calculateAndSaveMonthly(...) for *every* user in the system.
   * @param {number} year
   * @param {number} month
   * @returns {Promise<Object<string, string>>}
   *   A map of user_id → the generated salary-record ID.
   */
  async calculateAndSaveMonthlyForAll(year, month) {
    // 1) Pull every user_id
    const [users] = await this._db.execute(`SELECT id AS user_id FROM users`);

    const result = {};
    // 2) For each user, call your existing routine
    for (const { user_id } of users) {
      const { recordId } = await this.calculateAndSaveMonthly(
        user_id,
        year,
        month
      );
      result[user_id] = recordId;
    }
    return result;
  }

  /**
   * Fetch salary records for given year & month
   */
  async getSalaryRecords(year, month) {
    const [rows] = await this._db.query(
      `
      SELECT sr.*, u.fullname, u.username, u.id AS user_id
      FROM salary_records sr
      JOIN users u ON u.id = sr.user_id
      WHERE sr.year = ? AND sr.month = ?
      `,
      [year, month]
    );
    return rows;
  }

  /**
   * Fetch salary details for late/early/overtime
   */
  async getSalaryDetails(year, month) {
    const [rows] = await this._db.query(
      `
      SELECT sd.*, sr.user_id, u.fullname
      FROM salary_details sd
      JOIN salary_records sr ON sr.id = sd.record_id
      JOIN users u ON u.id = sr.user_id
      WHERE sr.year = ? AND sr.month = ?
        AND (sd.code LIKE 'LATE_IN:%' OR sd.code LIKE 'EARLY_OUT:%' OR sd.code = 'OT')
      ORDER BY sr.user_id, sd.code
      `,
      [year, month]
    );
    return rows;
  }

  async exportDailySummary(year, month, filePath) {
    const salaryRecords = await this.getSalaryRecords(year, month);
    if (salaryRecords.length === 0) {
      throw new Error("No salary records found for this period.");
    }

    const salaryDetails = await this.getSalaryDetails(year, month);

    const workbook = new ExcelJS.Workbook();

    /* ==============================================
       SHEET 1: DAILY SUMMARY
       ============================================== */
    const dailySummary = [];

    for (const rec of salaryRecords) {
      let meta = {};
      try {
        meta = JSON.parse(rec.meta_json || "{}");
      } catch (err) {
        console.warn(`Invalid meta_json for record ${rec.id}`);
      }

      // Overtime per date
      if (Array.isArray(meta.overtime_by_date)) {
        meta.overtime_by_date.forEach((ot) => {
          dailySummary.push({
            day: new Date(ot.date).getDate(),
            type: "Lembur",
            fullname: rec.fullname,
            unit: rec.username,
          });
        });
      }
    }

    // Late check-ins and early checkouts from salary_details
    salaryDetails.forEach((det) => {
      if (det.code.startsWith("LATE_IN:")) {
        const day = parseInt(det.code.split(":")[1].split("-")[2], 10);
        dailySummary.push({
          day,
          type: "Terlambat",
          fullname: det.fullname,
          unit: det.user_id,
          count: 0,
        });
      }
      if (det.code.startsWith("EARLY_OUT:")) {
        const day = parseInt(det.code.split(":")[1].split("-")[2], 10);
        dailySummary.push({
          day,
          type: "Pulang Cepat",
          fullname: det.fullname,
          unit: det.user_id,
          count: 0,
        });
      }
    });

    // Sort by date ascending then by fullname
    dailySummary.sort((a, b) =>
      a.day === b.day ? a.fullname.localeCompare(b.fullname) : a.day - b.day
    );

    const sheet1 = workbook.addWorksheet("Daily Summary");
    sheet1.columns = [
      { header: "Date", key: "day", width: 10 },
      { header: "Type", key: "type", width: 20 },
      { header: "Full Name", key: "fullname", width: 30 },
    ];

    dailySummary.forEach((row) => sheet1.addRow(row));

    /* ==============================================
       SHEET 2: REKAP OVERTIME
       ============================================== */
    const rekapMap = {};

    salaryRecords.forEach((rec) => {
      let meta = {};
      try {
        meta = JSON.parse(rec.meta_json || "{}");
      } catch (err) {}

      if (Array.isArray(meta.overtime_by_date)) {
        meta.overtime_by_date.forEach((ot) => {
          const key = `${rec.user_id}_${ot.date}`;
          if (!rekapMap[key]) {
            rekapMap[key] = {
              date: ot.date,
              fullname: rec.fullname,
              total_hours: 0,
              daily_rate: rec.basic_salary || 0,
              total_payment: 0,
            };
          }
          rekapMap[key].total_hours += parseFloat(ot.hours || 0);
          rekapMap[key].total_payment += parseFloat(ot.amount || 0);
        });
      }
    });

    // Sort ascending by date then fullname
    const sortedRekap = Object.values(rekapMap).sort((a, b) => {
      if (a.date === b.date) {
        return a.fullname.localeCompare(b.fullname);
      }
      return new Date(a.date) - new Date(b.date);
    });

    const sheet2 = workbook.addWorksheet("Rekap Overtime");
    sheet2.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Full Name", key: "fullname", width: 30 },
      { header: "Total Hours", key: "total_hours", width: 15 },
      { header: "Daily Rate", key: "daily_rate", width: 15 },
      { header: "Total Overtime Payment", key: "total_payment", width: 25 },
    ];

    sortedRekap.forEach((row) => {
      sheet2.addRow({
        date: row.date,
        fullname: row.fullname,
        total_hours: row.total_hours,
        daily_rate: row.daily_rate,
        total_payment: row.total_payment,
      });
    });

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }
}

module.exports = SalaryService;
