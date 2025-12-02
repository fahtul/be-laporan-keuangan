// src/services/mssql/AttendanceService.js

const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database"); // your shared DB module
const { getDistanceMeters } = require("../../utils/geolocation");
const moment = require("moment-timezone");
const ExcelJS = require("exceljs");

class AttendanceService {
  constructor() {
    this._db = database.getConnection();
  }

  // ─── Fetch office latitude/longitude/radius ─────────────────────────────────
  async _getOfficeLocation() {
    const [rows] = await this._db.execute(
      "SELECT latitude, longitude, radius_m FROM office_locations WHERE id = ?",
      [1]
    );
    if (!rows.length) {
      throw new InvariantError("Office location belum disetel");
    }
    return rows[0];
  }

  // ─── Insert a checkin/checkout record ────────────────────────────────────────
  // ─── Insert a checkin/checkout record ────────────────────────────────────────
  async record(userId, type, latitude, longitude, photoPath) {
    // 1) fetch geofence …
    const office = await this._getOfficeLocation();
    const dist = getDistanceMeters(
      Number(office.latitude),
      Number(office.longitude),
      Number(latitude),
      Number(longitude)
    );
    if (dist > office.radius_m) {
      throw new InvariantError(
        `Anda terlalu jauh (${Math.round(dist)}m). Maksimal ${
          office.radius_m
        }m.`
      );
    }

    // 2) insert row (unchanged)
    const insertSql = `
    INSERT INTO attendances 
      (user_id, type, latitude, longitude, photo_path, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
    // 3) build the ISO string _directly_ in Asia/Makassar
    // const recordedAt = moment
    //   .tz("Asia/Makassar") // ← notice: moment.tz, not moment().tz
    //   .format(); // default format: 2025-07-01T13:46:00+08:00
    const recordedAt = new Date();

    const params = [userId, type, latitude, longitude, photoPath, recordedAt];
    await this._db.execute(insertSql, params);

    return {
      userId,
      type,
      latitude,
      longitude,
      distance: Math.round(dist),
      photoPath,
      recordedAt, // now truly +08:00
    };
  }

  /** Fetch all attendance for a user, including their fullname */
  /** Fetch all attendance + fullname + computed distance */
  async getHistory(userId) {
    // 1) grab office once
    const office = await this._getOfficeLocation();

    // 2) fetch attendance rows
    const sql = `
      SELECT
        a.type,
        a.latitude,
        a.longitude,
        a.photo_path   AS photoPath,
        a.recorded_at  AS recordedAt,
        u.fullname     AS fullname
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
      ORDER BY a.recorded_at DESC
    `;
    const [rows] = await this._db.execute(sql, [userId]);

    // 3) map and compute distance
    return rows.map((r) => {
      const dist = getDistanceMeters(
        Number(office.latitude),
        Number(office.longitude),
        Number(r.latitude),
        Number(r.longitude)
      );
      return {
        type: r.type,
        latitude: r.latitude,
        longitude: r.longitude,
        photoPath: r.photoPath,
        recordedAt: r.recordedAt,
        fullname: r.fullname,
        distance: Math.round(dist), // in meters
      };
    });
  }

  async computePayroll(userId, yearMonth) {
    // 1) load schedule & salary rule
    const [[sched]] = await this._db.execute(
      `SELECT expected_checkin, expected_checkout
       FROM work_schedules WHERE user_id = ?`,
      [userId]
    );
    const [[rule]] = await this._db.execute(
      `SELECT base_monthly_salary, deduction_per_minute_late, deduction_per_minute_early
       FROM salary_rules WHERE user_id = ?`,
      [userId]
    );

    if (!sched || !rule) {
      throw new InvariantError("Schedule or salary rule missing");
    }

    // 2) fetch all attendances in that month
    const [rows] = await this._db.execute(
      `SELECT type, recorded_at AS ts
       FROM attendances
       WHERE user_id = ? 
         AND DATE_FORMAT(recorded_at, '%Y-%m') = ?`,
      [userId, yearMonth]
    );

    // 3) group by day
    const byDay = {};
    for (let r of rows) {
      const day = r.ts.toISOString().substr(0, 10);
      byDay[day] = byDay[day] || {};
      byDay[day][r.type] = r.ts;
    }

    let totalLateMin = 0,
      totalEarlyMin = 0;
    for (let [day, recs] of Object.entries(byDay)) {
      if (recs.checkin) {
        const actualIn = recs.checkin;
        const schedIn = new Date(`${day}T${sched.expected_checkin}`);
        const diffMin = Math.max(0, (actualIn - schedIn) / 60000);
        totalLateMin += diffMin;
      }
      if (recs.checkout) {
        const actualOut = recs.checkout;
        const schedOut = new Date(`${day}T${sched.expected_checkout}`);
        const diffMin = Math.max(0, (schedOut - actualOut) / 60000);
        totalEarlyMin += diffMin;
      }
    }

    // 4) compute deductions & net salary
    const lateDeduction = totalLateMin * rule.deduction_per_minute_late;
    const earlyDeduction = totalEarlyMin * rule.deduction_per_minute_early;
    const netSalary = rule.base_monthly_salary - lateDeduction - earlyDeduction;

    return {
      yearMonth,
      totalLateMin: Math.round(totalLateMin),
      totalEarlyMin: Math.round(totalEarlyMin),
      lateDeduction: lateDeduction.toFixed(2),
      earlyDeduction: earlyDeduction.toFixed(2),
      baseSalary: rule.base_monthly_salary.toFixed(2),
      netSalary: netSalary.toFixed(2),
    };
  }

  /**
   * Fetch all attendances in a given year-month, across all users,
   * optionally filtered by a single userId.
   * @param {string} yearMonth  format "YYYY-MM"
   * @param {string|null} userId
   */
  async getAllAttendancesByMonth(yearMonth, userId = null) {
    const office = await this._getOfficeLocation();

    // Base query
    let sql = `
      SELECT
        a.user_id           AS userId,
        u.fullname          AS fullname,
        a.type,
        a.latitude,
        a.longitude,
        a.photo_path        AS photoPath,
        a.recorded_at       AS recordedAt
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      WHERE DATE_FORMAT(a.recorded_at, '%Y-%m') = ?
    `;
    const binds = [yearMonth];

    // Jika userId diberikan, tambahkan kondisi
    if (userId) {
      sql += ` AND a.user_id = ?`;
      binds.push(userId);
    }

    sql += ` ORDER BY a.recorded_at DESC`;

    const [rows] = await this._db.execute(sql, binds);

    return rows.map((r) => {
      const dist = getDistanceMeters(
        Number(office.latitude),
        Number(office.longitude),
        Number(r.latitude),
        Number(r.longitude)
      );
      return {
        userId: r.userId,
        fullname: r.fullname,
        type: r.type,
        latitude: r.latitude,
        longitude: r.longitude,
        photoPath: r.photoPath,
        recordedAt: r.recordedAt,
        distance: Math.round(dist),
      };
    });
  }

  async exportAttendanceRekap(userId) {
    // 1) Fetch all attendance data for the given user
    const [rows] = await this._db.execute(
      `SELECT
      a.type,
      a.recorded_at AS recordedAt
    FROM attendances a
    WHERE a.user_id = ?
    ORDER BY a.recorded_at ASC`,
      [userId]
    );

    // 2) Group attendances by day
    const groupedByDay = {};

    rows.forEach((attendance) => {
      const recordedAt = new Date(attendance.recordedAt);

      // Check if it's a valid Date
      if (isNaN(recordedAt)) {
        console.error("Invalid date:", attendance.recordedAt);
        return; // Skip invalid date
      }

      const dateKey = recordedAt.toISOString().substr(0, 10); // YYYY-MM-DD
      if (!groupedByDay[dateKey]) {
        groupedByDay[dateKey] = { checkin: null, checkout: null };
      }

      if (attendance.type === "checkin") {
        if (
          !groupedByDay[dateKey].checkin ||
          recordedAt < groupedByDay[dateKey].checkin
        ) {
          groupedByDay[dateKey].checkin = recordedAt;
        }
      }

      if (attendance.type === "checkout") {
        if (
          !groupedByDay[dateKey].checkout ||
          recordedAt > groupedByDay[dateKey].checkout
        ) {
          groupedByDay[dateKey].checkout = recordedAt;
        }
      }
    });

    // 3) Prepare the final data structure for Excel export
    const rekapData = [];
    for (const [date, { checkin, checkout }] of Object.entries(groupedByDay)) {
      rekapData.push({
        date,
        checkin: checkin ? checkin.toISOString() : null,
        checkout: checkout ? checkout.toISOString() : null,
      });
    }

    return rekapData;
  }

  async exportAllUsersAttendanceRekap() {
    const [users] = await this._db.execute(
      `SELECT id,username, fullname FROM users`
    );
    const allUsersRekap = [];

    for (const user of users) {
      const rekap = await this.exportAttendanceRekap(user.id); // Fetch attendance for each user
      allUsersRekap.push({
        username: user.username,
        userId: user.id,
        fullname: user.fullname,
        attendance: rekap,
      });
    }

    return allUsersRekap;
  }

  /**
   * Upsert manual clock-in/clock-out for a given user & date.
   * - Deletes any checkin/checkout rows on that date, then re-inserts provided times.
   * - Handles overnight (checkout < checkin → +1 day).
   * - Times are interpreted in Asia/Makassar.
   */
  async upsertManualTimes(
    userId,
    date,
    clockIn,
    clockOut,
    source = "manual_edit",
    editedBy = null
  ) {
    const tz = "Asia/Makassar";

    // helper to build Date from local HH:mm
    const makeTs = (d, hhmm) => {
      if (!hhmm) return null;
      return moment.tz(`${d} ${hhmm}`, "YYYY-MM-DD HH:mm", tz).toDate();
    };

    let tsIn = makeTs(date, clockIn);
    let tsOut = makeTs(date, clockOut);

    // overnight: add 1 day to checkout if earlier than checkin
    if (tsIn && tsOut && tsOut < tsIn) {
      tsOut = moment(tsOut).add(1, "day").toDate();
    }

    // Remove old rows for that date
    await this._db.execute(
      `DELETE FROM attendances 
           WHERE user_id = ? 
             AND type IN ('checkin','checkout')
             AND DATE(recorded_at) = ?`,
      [userId, date]
    );

    // Insert as provided
    const cols = [
      "user_id",
      "type",
      "latitude",
      "longitude",
      "photo_path",
      "recorded_at",
      "source",
      "edited_by",
    ];
    const insert = `INSERT INTO attendances (${cols.join(
      ","
    )}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    if (tsIn) {
      await this._db.execute(insert, [
        userId,
        "checkin",
        0.0,
        0.0,
        "",
        tsIn,
        source,
        editedBy,
      ]);
    }
    if (tsOut) {
      await this._db.execute(insert, [
        userId,
        "checkout",
        0.0,
        0.0,
        "",
        tsOut,
        source,
        editedBy,
      ]);
    }
  }

  // async exportAllUsersAttendanceExcel(request, h) {
  //   try {
  //     const allUsersRekap = await this.exportAllUsersAttendanceRekap();

  //     // Create a new workbook
  //     const workbook = new ExcelJS.Workbook();
  //     const worksheet = workbook.addWorksheet("Attendance");

  //     // Define columns
  //     worksheet.columns = [
  //       { header: "User ID", key: "userId", width: 15 },
  //       { header: "Full Name", key: "fullname", width: 30 },
  //       { header: "Date", key: "date", width: 15 },
  //       { header: "Check-in", key: "checkin", width: 25 },
  //       { header: "Checkout", key: "checkout", width: 25 },
  //     ];

  //     // Add rows to the sheet
  //     allUsersRekap.forEach((user) => {
  //       user.attendance.forEach((attendance) => {
  //         worksheet.addRow({
  //           userId: user.userId,
  //           fullname: user.fullname,
  //           date: attendance.date,
  //           checkin: attendance.checkin || "N/A",
  //           checkout: attendance.checkout || "N/A",
  //         });
  //       });
  //     });

  //     // Create the file path
  //     const filePath = path.resolve(
  //       __dirname,
  //       "../../uploads/attendance",
  //       `attendance_all_users_${Date.now()}.xlsx`
  //     );

  //     // Write to file
  //     await workbook.xlsx.writeFile(filePath);

  //     // Send the file to the client for download
  //     return h.file(filePath, {
  //       filename: `attendance_all_users_${Date.now()}.xlsx`,
  //       confine: false, // Allow downloading from a specific folder
  //     });
  //   } catch (err) {
  //     console.error(err);
  //     return h
  //       .response({ status: "error", message: "Internal Server Error" })
  //       .code(500);
  //   }
  // }
}

module.exports = AttendanceService;
