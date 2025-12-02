// src/services/mssql/AttendanceService.js

const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database"); // your shared DB module
// const { getDistanceMeters } = require("../../utils/geolocation");
// const moment = require("moment-timezone");
// const ExcelJS = require("exceljs");

class AttendanceReportService {
  constructor() {
    this._db = database.getConnection();
  }

  // async getUserMonthlyReport(userId, year, month) {
  //   const query = `
  //   SELECT
  //     us.date                                  AS date,
  //     sc.name                                  AS shift_name,
  //     sc.time_start                            AS scheduled_in,
  //     sc.time_end                              AS scheduled_out,
  //     MIN(CASE WHEN a.type = 'checkin' THEN a.recorded_at END)  AS clock_in,
  //     MAX(CASE WHEN a.type = 'checkout' THEN a.recorded_at END) AS clock_out,
  //     CASE
  //       WHEN MIN(CASE WHEN a.type='checkin' THEN a.recorded_at END) IS NULL
  //         AND MIN(CASE WHEN a.type='checkout' THEN a.recorded_at END) IS NULL THEN 'No clock in/out'
  //       WHEN MIN(CASE WHEN a.type='checkin' THEN a.recorded_at END) IS NULL THEN 'No clock in'
  //       WHEN MIN(CASE WHEN a.type='checkout' THEN a.recorded_at END) IS NULL THEN 'No clock out'
  //       ELSE 'H'
  //     END                                          AS attendance_code,
  //     GROUP_CONCAT(
  //       DISTINCT CASE WHEN r.type = 'time_off' AND r.status='approved'
  //         THEN CONCAT('TO#', r.id)
  //       ELSE NULL END
  //       SEPARATOR ','
  //     )                                             AS time_off_codes,
  //     GROUP_CONCAT(
  //       DISTINCT CASE WHEN r.type = 'overtime' AND r.status='approved'
  //         THEN CONCAT(TIME_FORMAT(TIMEDIFF(r.end_time, r.start_time),'%H:%i'))
  //       ELSE NULL END
  //       SEPARATOR ','
  //     )                                            AS overtime_hours
  //   FROM user_schedules us
  //   JOIN schedule_categories sc
  //     ON us.category_id = sc.id
  //   LEFT JOIN attendances a
  //     ON a.user_id   = us.user_id
  //     AND DATE(a.recorded_at) = us.date
  //   LEFT JOIN requests r
  //     ON r.user_id         = us.user_id
  //     AND DATE(r.request_date) = us.date
  //     AND r.status = 'approved'
  //   WHERE us.user_id = ?
  //     AND YEAR(us.date)  = ?
  //     AND MONTH(us.date) = ?
  //   GROUP BY us.date, sc.name, sc.time_start, sc.time_end
  //   ORDER BY us.date;
  // `;
  //   console.log("SQL:", query);
  //   console.log("Params:", [userId, year, month]);
  //   const params = [userId, year, month];
  //   const [rows] = await this._db.execute(query, params);
  //   return rows;
  // }

  // services/mysql/... e.g. AttendanceService.js
  // async getUserMonthlyReport(userId, year, month, status = null) {
  //   // base report (no GROUP BY in the outer query)
  //   const base = `
  //   SELECT
  //     us.date,
  //     sc.name       AS shift_name,
  //     sc.time_start AS scheduled_in,
  //     sc.time_end   AS scheduled_out,

  //     a.clock_in,
  //     a.clock_out,

  //     CASE
  //       WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'No clock in/out'
  //       WHEN a.clock_in IS NULL THEN 'No clock in'
  //       WHEN a.clock_out IS NULL THEN 'No clock out'
  //       ELSE 'H'
  //     END AS attendance_code,

  //     r.time_off_codes,
  //     r.overtime_hours,

  //     CASE
  //       WHEN LOWER(sc.name)='dayoff' THEN 'day_off'
  //       WHEN r.has_time_off = 1      THEN 'time_off'
  //       WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'no_in'     -- bucket both "no in/out" as no_in
  //       WHEN a.clock_in IS NULL      THEN 'no_in'
  //       WHEN a.clock_out IS NULL     THEN 'no_out'
  //       WHEN a.clock_in  > TIMESTAMP(us.date, sc.time_start) THEN 'late_in'
  //       WHEN a.clock_out <
  //            CASE WHEN sc.time_end <= sc.time_start
  //                   THEN DATE_ADD(TIMESTAMP(us.date, sc.time_end), INTERVAL 1 DAY)
  //                 ELSE TIMESTAMP(us.date, sc.time_end) END
  //            THEN 'early_out'
  //       ELSE 'on_time'
  //     END AS status_tag
  //   FROM user_schedules us
  //   JOIN schedule_categories sc
  //     ON sc.id = us.category_id

  //   LEFT JOIN (
  //     SELECT
  //       user_id,
  //       DATE(recorded_at) AS d,
  //       MIN(CASE WHEN type='checkin'  THEN recorded_at END)  AS clock_in,
  //       MAX(CASE WHEN type='checkout' THEN recorded_at END)  AS clock_out
  //     FROM attendances
  //     WHERE user_id = ? AND YEAR(recorded_at)=? AND MONTH(recorded_at)=?
  //     GROUP BY user_id, DATE(recorded_at)
  //   ) a ON a.user_id = us.user_id AND a.d = us.date

  //   LEFT JOIN (
  //     SELECT
  //       user_id,
  //       DATE(request_date) AS d,
  //       MAX(CASE WHEN type='time_off'  AND status='approved' THEN 1 ELSE 0 END) AS has_time_off,
  //       GROUP_CONCAT(DISTINCT CASE WHEN type='time_off'  AND status='approved'
  //         THEN CONCAT('TO#', id) END) AS time_off_codes,
  //       GROUP_CONCAT(DISTINCT CASE WHEN type='overtime' AND status='approved'
  //         THEN TIME_FORMAT(TIMEDIFF(end_time, start_time),'%H:%i') END) AS overtime_hours
  //     FROM requests
  //     WHERE status='approved' AND user_id = ? AND YEAR(request_date)=? AND MONTH(request_date)=?
  //     GROUP BY user_id, DATE(request_date)
  //   ) r ON r.user_id = us.user_id AND r.d = us.date

  //   WHERE us.user_id = ? AND YEAR(us.date)=? AND MONTH(us.date)=?
  //   ORDER BY us.date
  // `;

  //   // params for the three places we filter by user/year/month
  //   const p = [userId, year, month, userId, year, month, userId, year, month];

  //   // KPI (server-side)
  //   const kpiSql = `
  //   SELECT
  //     SUM(status_tag IN ('on_time','late_in','early_out')) AS present_total,
  //     SUM(status_tag='on_time')  AS on_time,
  //     SUM(status_tag='late_in')  AS late_in,
  //     SUM(status_tag='early_out') AS early_out,

  //     SUM(status_tag IN ('no_in','no_out','invalid','absent')) AS not_present_total,
  //     SUM(status_tag='no_in')   AS no_in,
  //     SUM(status_tag='no_out')  AS no_out,
  //     SUM(status_tag='invalid') AS invalid,
  //     SUM(status_tag='absent')  AS absent,

  //     SUM(status_tag IN ('time_off','day_off')) AS away_total,
  //     SUM(status_tag='time_off') AS time_off,
  //     SUM(status_tag='day_off')  AS day_off
  //   FROM (${base}) x
  // `;
  //   const [kpiRows] = await this._db.execute(kpiSql, p);

  //   // Report (+ optional status filter from UI chips)
  //   let reportSql = `SELECT * FROM (${base}) x`;
  //   const rp = [...p];
  //   if (status && status !== "all") {
  //     if (status === "present") {
  //       reportSql += ` WHERE x.status_tag IN ('on_time','late_in','early_out')`;
  //     } else {
  //       reportSql += ` WHERE x.status_tag = ?`;
  //       rp.push(status);
  //     }
  //   }
  //   reportSql += ` ORDER BY x.date`;

  //   const [reportRows] = await this._db.execute(reportSql, rp);

  //   const k = kpiRows[0] || {};
  //   const kpi = {
  //     present: {
  //       total: k.present_total || 0,
  //       on_time: k.on_time || 0,
  //       late_in: k.late_in || 0,
  //       early_out: k.early_out || 0,
  //     },
  //     not_present: {
  //       total: k.not_present_total || 0,
  //       no_in: k.no_in || 0,
  //       no_out: k.no_out || 0,
  //       invalid: k.invalid || 0,
  //       absent: k.absent || 0,
  //     },
  //     away: {
  //       total: k.away_total || 0,
  //       time_off: k.time_off || 0,
  //       day_off: k.day_off || 0,
  //     },
  //   };

  //   return { kpi, report: reportRows };
  // }

  async getUserMonthlyReport(userId, year, month, status = null) {
    // base report (no GROUP BY in the outer query)
    const base = `
    SELECT
      us.date,
      sc.name       AS shift_name,
      sc.time_start AS scheduled_in,
      sc.time_end   AS scheduled_out,

      a.clock_in,
      a.clock_out,

      CASE
        WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'No clock in/out'
        WHEN a.clock_in IS NULL THEN 'No clock in'
        WHEN a.clock_out IS NULL THEN 'No clock out'
        ELSE 'H'
      END AS attendance_code,

      r.time_off_codes,
      r.overtime_hours,

      CASE
        WHEN LOWER(sc.name)='dayoff' THEN 'day_off'
        WHEN r.has_time_off = 1      THEN 'time_off'
        WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'no_in'     -- bucket both "no in/out" as no_in
        WHEN a.clock_in IS NULL      THEN 'no_in'
        WHEN a.clock_out IS NULL     THEN 'no_out'
        WHEN a.clock_in  > TIMESTAMP(us.date, sc.time_start) THEN 'late_in'
        WHEN a.clock_out <
             CASE WHEN sc.time_end <= sc.time_start
                    THEN DATE_ADD(TIMESTAMP(us.date, sc.time_end), INTERVAL 1 DAY)
                  ELSE TIMESTAMP(us.date, sc.time_end) END
             THEN 'early_out'
        ELSE 'on_time'
      END AS status_tag
    FROM user_schedules us
    JOIN schedule_categories sc
      ON sc.id = us.category_id

    LEFT JOIN (
      SELECT
        user_id,
        DATE(recorded_at) AS d,
        MIN(CASE WHEN type='checkin'  THEN recorded_at END)  AS clock_in,
        MAX(CASE WHEN type='checkout' THEN recorded_at END)  AS clock_out
      FROM attendances
      WHERE user_id = ? AND YEAR(recorded_at)=? AND MONTH(recorded_at)=?
      GROUP BY user_id, DATE(recorded_at)
    ) a ON a.user_id = us.user_id AND a.d = us.date

    LEFT JOIN (
      SELECT
        user_id,
        DATE(request_date) AS d,
        MAX(CASE WHEN type='time_off'  AND status='approved' THEN 1 ELSE 0 END) AS has_time_off,
        GROUP_CONCAT(DISTINCT CASE WHEN type='time_off'  AND status='approved'
          THEN CONCAT('TO#', id) END) AS time_off_codes,
        GROUP_CONCAT(DISTINCT CASE WHEN type='overtime' AND status='approved'
          THEN TIME_FORMAT(TIMEDIFF(end_time, start_time),'%H:%i') END) AS overtime_hours
      FROM requests
      WHERE status='approved' AND user_id = ? AND YEAR(request_date)=? AND MONTH(request_date)=?
      GROUP BY user_id, DATE(request_date)
    ) r ON r.user_id = us.user_id AND r.d = us.date

    WHERE us.user_id = ? AND YEAR(us.date)=? AND MONTH(us.date)=?
    ORDER BY us.date
  `;

    // params for the three places we filter by user/year/month
    const p = [userId, year, month, userId, year, month, userId, year, month];

    // KPI (server-side)
    const kpiSql = `
    SELECT
      SUM(status_tag IN ('on_time','late_in','early_out')) AS present_total,
      SUM(status_tag='on_time')  AS on_time,
      SUM(status_tag='late_in')  AS late_in,
      SUM(status_tag='early_out') AS early_out,

      SUM(status_tag IN ('no_in','no_out','invalid','absent')) AS not_present_total,
      SUM(status_tag='no_in')   AS no_in,
      SUM(status_tag='no_out')  AS no_out,
      SUM(status_tag='invalid') AS invalid,
      SUM(status_tag='absent')  AS absent,

      SUM(status_tag IN ('time_off','day_off')) AS away_total,
      SUM(status_tag='time_off') AS time_off,
      SUM(status_tag='day_off')  AS day_off
    FROM (${base}) x
  `;
    const [kpiRows] = await this._db.execute(kpiSql, p);

    // Report (+ optional status filter from UI chips)
    let reportSql = `SELECT * FROM (${base}) x`;
    const rp = [...p];
    if (status && status !== "all") {
      if (status === "present") {
        reportSql += ` WHERE x.status_tag IN ('on_time','late_in','early_out')`;
      } else {
        reportSql += ` WHERE x.status_tag = ?`;
        rp.push(status);
      }
    }
    reportSql += ` ORDER BY x.date`;

    const [reportRows] = await this._db.execute(reportSql, rp);

    const k = kpiRows[0] || {};
    const kpi = {
      present: {
        total: k.present_total || 0,
        on_time: k.on_time || 0,
        late_in: k.late_in || 0,
        early_out: k.early_out || 0,
      },
      not_present: {
        total: k.not_present_total || 0,
        no_in: k.no_in || 0,
        no_out: k.no_out || 0,
        invalid: k.invalid || 0,
        absent: k.absent || 0,
      },
      away: {
        total: k.away_total || 0,
        time_off: k.time_off || 0,
        day_off: k.day_off || 0,
      },
    };

    return { kpi, report: reportRows };
  }

  /**
   * Monthly report per user (driven by user_schedules + schedule_categories)
   * Returns: { kpi, report }
   * - report[] rows contain: date, shift_name, scheduled_in/out, clock_in/out, status_label
   */
  async getUserMonthlyReport(userId, year, month, status = null) {
    if (!userId || !year || !month) {
      throw new InvariantError("userId, year, month wajib diisi");
    }

    // Base SELECT used twice (for KPI and for report)
    const base = `
      SELECT
        us.date,
        sc.name       AS shift_name,
        sc.time_start AS scheduled_in,
        sc.time_end   AS scheduled_out,

        a.clock_in,
        a.clock_out,

        CASE
          WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'No clock in/out'
          WHEN a.clock_in IS NULL THEN 'No clock in'
          WHEN a.clock_out IS NULL THEN 'No clock out'
          ELSE 'H'
        END AS attendance_code,

        r.time_off_codes,
        r.overtime_hours,

        CASE
          WHEN LOWER(sc.name)='dayoff' THEN 'day_off'
          WHEN r.has_time_off = 1      THEN 'time_off'
          WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'no_in'
          WHEN a.clock_in IS NULL      THEN 'no_in'
          WHEN a.clock_out IS NULL     THEN 'no_out'
          WHEN a.clock_in  > TIMESTAMP(us.date, sc.time_start) THEN 'late_in'
          WHEN a.clock_out <
               CASE WHEN sc.time_end <= sc.time_start
                      THEN DATE_ADD(TIMESTAMP(us.date, sc.time_end), INTERVAL 1 DAY)
                    ELSE TIMESTAMP(us.date, sc.time_end) END
               THEN 'early_out'
          ELSE 'on_time'
        END AS status_tag,

        -- Human-friendly label for FE/Excel
        CASE
          WHEN LOWER(sc.name)='dayoff' THEN 'DAY OFF'
          WHEN r.has_time_off = 1      THEN 'APPROVED:TIME_OFF'
          WHEN a.clock_in IS NULL AND a.clock_out IS NULL THEN 'ALPHA'
          WHEN a.clock_in  > TIMESTAMP(us.date, sc.time_start)
           AND a.clock_out <
               CASE WHEN sc.time_end <= sc.time_start
                      THEN DATE_ADD(TIMESTAMP(us.date, sc.time_end), INTERVAL 1 DAY)
                    ELSE TIMESTAMP(us.date, sc.time_end) END
            THEN 'LATE & EARLY'
          WHEN a.clock_in  > TIMESTAMP(us.date, sc.time_start) THEN 'LATE'
          WHEN a.clock_out <
               CASE WHEN sc.time_end <= sc.time_start
                      THEN DATE_ADD(TIMESTAMP(us.date, sc.time_end), INTERVAL 1 DAY)
                    ELSE TIMESTAMP(us.date, sc.time_end) END
            THEN 'EARLY'
          ELSE 'OK'
        END AS status_label
      FROM user_schedules us
      JOIN schedule_categories sc
        ON sc.id = us.category_id OR sc.name = us.category_id

      LEFT JOIN (
        SELECT
          user_id,
          DATE(recorded_at) AS d,
          MIN(CASE WHEN type='checkin'  THEN recorded_at END)  AS clock_in,
          MAX(CASE WHEN type='checkout' THEN recorded_at END)  AS clock_out
        FROM attendances
        WHERE user_id = ? AND YEAR(recorded_at)=? AND MONTH(recorded_at)=?
        GROUP BY user_id, DATE(recorded_at)
      ) a ON a.user_id = us.user_id AND a.d = us.date

      LEFT JOIN (
        SELECT
          user_id,
          DATE(request_date) AS d,
          MAX(CASE WHEN type='time_off'  AND status='approved' THEN 1 ELSE 0 END) AS has_time_off,
          GROUP_CONCAT(DISTINCT CASE WHEN type='time_off'  AND status='approved'
            THEN CONCAT('TO#', id) END) AS time_off_codes,
          GROUP_CONCAT(DISTINCT CASE WHEN type='overtime' AND status='approved'
            THEN TIME_FORMAT(TIMEDIFF(end_time, start_time),'%H:%i') END) AS overtime_hours
        FROM requests
        WHERE status='approved' AND user_id = ? AND YEAR(request_date)=? AND MONTH(request_date)=?
        GROUP BY user_id, DATE(request_date)
      ) r ON r.user_id = us.user_id AND r.d = us.date

      WHERE us.user_id = ? AND YEAR(us.date)=? AND MONTH(us.date)=?
    `;

    const p = [userId, year, month, userId, year, month, userId, year, month];

    // KPI aggregation on top of base
    const kpiSql = `
      SELECT
        SUM(status_tag IN ('on_time','late_in','early_out')) AS present_total,
        SUM(status_tag='on_time')   AS on_time,
        SUM(status_tag='late_in')   AS late_in,
        SUM(status_tag='early_out') AS early_out,

        SUM(status_tag IN ('no_in','no_out')) AS not_present_total,
        SUM(status_tag='no_in')     AS no_in,
        SUM(status_tag='no_out')    AS no_out,

        SUM(status_tag IN ('time_off','day_off')) AS away_total,
        SUM(status_tag='time_off') AS time_off,
        SUM(status_tag='day_off')  AS day_off
      FROM (${base}) x
    `;
    const [kpiRows] = await this._db.execute(kpiSql, p);

    // Final report rows (optionally filter by status)
    let reportSql = `
      SELECT
        date,
        shift_name,
        scheduled_in,
        scheduled_out,
        clock_in,
        clock_out,
        attendance_code,
        time_off_codes,
        overtime_hours,
        status_tag,
        status_label
      FROM (${base}) x
    `;
    const rp = [...p];
    if (status && status !== "all") {
      // allow 'present' chip to include 3 tags
      if (status === "present") {
        reportSql += ` WHERE x.status_tag IN ('on_time','late_in','early_out')`;
      } else {
        reportSql += ` WHERE x.status_tag = ?`;
        rp.push(status);
      }
    }
    reportSql += ` ORDER BY date ASC`;

    const [reportRows] = await this._db.execute(reportSql, rp);

    const k = kpiRows[0] || {};
    const kpi = {
      present: {
        total: Number(k.present_total || 0),
        on_time: Number(k.on_time || 0),
        late_in: Number(k.late_in || 0),
        early_out: Number(k.early_out || 0),
      },
      not_present: {
        total: Number(k.not_present_total || 0),
        no_in: Number(k.no_in || 0),
        no_out: Number(k.no_out || 0),
      },
      away: {
        total: Number(k.away_total || 0),
        time_off: Number(k.time_off || 0),
        day_off: Number(k.day_off || 0),
      },
    };

    return { kpi, report: reportRows };
  }

  /**
   * Build daily summary (pivot) from monthly report rows.
   * Output rows like: { date, OK, LATE, EARLY, 'LATE & EARLY', ALPHA, SICK, TIME_OFF }
   */
  buildDailySummary(rows) {
    const summary = {};
    // SICK exists in requests; TIME_OFF mapped from APPROVED:TIME_OFF label above
    const statuses = [
      "OK",
      "LATE",
      "EARLY",
      "LATE & EARLY",
      "ALPHA",
      "SICK",
      "TIME_OFF",
    ];

    for (const r of rows) {
      const date = String(r.date).slice(0, 10);
      let label = String(r.status_label || "").toUpperCase();

      // Normalize APPROVED:<TYPE> -> that TYPE bucket (e.g. APPROVED:SICK -> SICK, APPROVED:TIME_OFF -> TIME_OFF)
      if (label.startsWith("APPROVED:")) {
        const t = label.split(":")[1] || "";
        if (t === "SICK") label = "SICK";
        else if (t === "TIME_OFF") label = "TIME_OFF";
      }

      if (!summary[date]) {
        summary[date] = {};
        statuses.forEach((s) => (summary[date][s] = 0));
      }
      if (summary[date][label] !== undefined) {
        summary[date][label]++;
      }
    }

    const dailyRows = [];
    const totals = {};
    statuses.forEach((s) => (totals[s] = 0));

    for (const [date, counts] of Object.entries(summary)) {
      dailyRows.push({ date, ...counts });
      statuses.forEach((s) => (totals[s] += counts[s]));
    }

    // Totals footer row
    dailyRows.push({ date: "Total", ...totals });
    return dailyRows;
  }

  async getAllUsersMonthlyReport(year, month) {
    const [users] = await this._db.execute("SELECT id, fullname FROM users");

    const results = [];

    for (const u of users) {
      const { report } = await this.getUserMonthlyReport(u.id, year, month);
      results.push({
        user_id: u.id,
        fullname: u.fullname,
        report,
      });
    }

    return results; // [{ user_id, fullname, report: [...]}, ...]
  }

  /** Build per-user summary across the month */
  buildUserSummary(allReports) {
    const summary = {};

    for (const user of allReports) {
      if (!summary[user.user_id]) {
        summary[user.user_id] = {
          fullname: user.fullname,
          OK: 0,
          LATE: 0,
          EARLY: 0,
          "LATE & EARLY": 0,
          ALPHA: 0,
          SICK: 0,
          TIME_OFF: 0,
        };
      }
      for (const r of user.report) {
        let label = String(r.status_label || "").toUpperCase();
        if (label.startsWith("APPROVED:")) {
          const t = label.split(":")[1] || "";
          if (t === "SICK") label = "SICK";
          else if (t === "TIME_OFF") label = "TIME_OFF";
        }
        if (summary[user.user_id][label] !== undefined) {
          summary[user.user_id][label]++;
        }
      }
    }

    return Object.entries(summary).map(([uid, s]) => ({
      user_id: uid,
      fullname: s.fullname,
      ...s,
    }));
  }

  /** Get current leader’s role/division/unit */
  async _getLeaderContext(leaderId) {
    const [rows] = await this._db.execute(
      `SELECT id, role_id AS roleId, division_id AS divisionId, unit_id AS unitId
       FROM users WHERE id = ?`,
      [leaderId]
    );
    if (!rows.length) throw new InvariantError("Leader/user tidak ditemukan");
    return rows[0];
  }

  /**
   * Resolve team users under a leader:
   * - Role 3 (Kepala Unit): team = all users in same unit with role 4 (staff)
   * - Role 2 (Kepala Divisi): team = all users in same division with role IN (3,4)
   * - Role 1 (Director): team = everyone (except self if you want)
   * - Role 4 (Staff): team = empty (no subordinates)
   *
   * Returns an array of user IDs.
   */
  async getTeamUserIdsUnderLeader(leaderId) {
    const ctx = await this._getLeaderContext(leaderId);

    let sql = "";
    let params = [];

    if (ctx.roleId === 3) {
      // Kepala Unit → staff in same unit
      sql = `
        SELECT u.id
        FROM users u
        WHERE u.unit_id = ? AND u.role_id = 4
      `;
      params = [ctx.unitId];
    } else if (ctx.roleId === 2) {
      // Kepala Divisi → unit heads + staff in same division
      sql = `
        SELECT u.id
        FROM users u
        WHERE u.division_id = ? AND u.role_id IN (3, 4)
      `;
      params = [ctx.divisionId];
    } else if (ctx.roleId === 1) {
      // Director → all (optionally exclude self)
      sql = `
        SELECT u.id
        FROM users u
        WHERE u.id <> ?
      `;
      params = [leaderId];
    } else {
      // Staff → no subordinates
      return [];
    }

    const [rows] = await this._db.execute(sql, params);
    return rows.map((r) => r.id);
  }

  /**
   * Get daily attendance report (one day) for a leader’s team.
   *
   * @param {Object} args
   * @param {string} args.leaderId
   * @param {string} args.date              // 'YYYY-MM-DD'
   * @param {string} [args.workStart='08:00:00'] // fallback if you don’t link schedule
   * @param {string} [args.workEnd='17:00:00']
   * @param {string[]} [args.onlyUserIds]   // optional extra filter
   *
   * Returns array:
   * [
   *  {
   *    user_id, fullname, division_id, unit_id,
   *    first_checkin, last_checkout,
   *    present, late_minutes, early_minutes,
   *    request_type, request_status, // from approved requests (if any)
   *    status_label // OK | LATE | EARLY | LATE & EARLY | ALPHA | APPROVED:<TYPE>
   *  }
   * ]
   */
  async getDailyTeamAttendance({
    leaderId,
    date, // 'YYYY-MM-DD' or Date
    workStart = "08:00:00", // fallback ONLY if no row in user_schedules for that day
    workEnd = "17:00:00",
    onlyUserIds = [],
  }) {
    if (!date)
      throw new InvariantError("Parameter date wajib diisi (YYYY-MM-DD)");

    // Normalize `date` to 'YYYY-MM-DD' string
    const d =
      typeof date === "string"
        ? date.slice(0, 10)
        : new Date(date).toISOString().slice(0, 10);

    // Build day window strings (local DB time; if DB stores UTC, adjust here to your business TZ)
    const startOfDay = `${d} 00:00:00`;
    const endOfDay = `${d} 23:59:59`; // or compute next day 00:00:00 and use '<' comparison

    // Optional narrowing (leader may filter down)
    let onlySet = null;
    if (Array.isArray(onlyUserIds) && onlyUserIds.length) {
      onlySet = new Set(onlyUserIds.filter(Boolean).map(String));
    } else if (typeof onlyUserIds === "string" && onlyUserIds.trim()) {
      onlySet = new Set(
        onlyUserIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
    const onlyUserWhere = onlySet
      ? "AND u.id IN (" +
        Array.from(onlySet)
          .map(() => "?")
          .join(",") +
        ")"
      : "";
    const onlyUserParams = onlySet ? Array.from(onlySet) : [];

    const sql = `
    WITH leader AS (
      SELECT id, role_id AS roleId, division_id AS divisionId, unit_id AS unitId
      FROM users
      WHERE id = ?
    ),
    team AS (
      SELECT u.id, u.fullname, u.division_id, u.unit_id
      FROM users u
      JOIN leader l ON 1=1
      WHERE
        (
          (l.roleId = 3 AND u.unit_id = l.unitId AND u.role_id = 4)             -- KU → staff
          OR
          (l.roleId = 2 AND u.division_id = l.divisionId AND u.role_id IN (3,4)) -- KD → unit heads + staff
          -- OR (l.roleId = 1 AND u.role_id IN (2,3,4))                          -- enable if Director sees org-wide
        )
        AND u.id <> l.id
        ${onlyUserWhere}
    ),
    sched AS (
      SELECT
        us.user_id,
        sc.name       AS schedule_name,
        sc.time_start AS work_start,
        sc.time_end   AS work_end
      FROM user_schedules us
      JOIN team t2 ON t2.id = us.user_id
      JOIN schedule_categories sc
        ON (sc.id = TRIM(us.category_id) OR sc.name = TRIM(us.category_id))
      WHERE us.date = DATE(?)       -- robust even if a JS Date slips in
    ),
    aa AS (
      SELECT
        a.user_id,
        MIN(CASE WHEN a.type = 'checkin' THEN a.recorded_at END)  AS first_checkin,
        MAX(CASE WHEN a.type = 'checkout' THEN a.recorded_at END) AS last_checkout
      FROM attendances a
      WHERE a.recorded_at >= ?
        AND a.recorded_at <= ?
      GROUP BY a.user_id
    ),
    ra AS (
      SELECT
        r.user_id,
        MIN(r.type)   AS request_type,
        MIN(r.status) AS request_status
      FROM requests r
      WHERE r.status = 'approved'
        AND DATE(?) BETWEEN r.request_date AND COALESCE(r.request_end_date, r.request_date)
      GROUP BY r.user_id
    )
    SELECT
      t.id           AS user_id,
      t.fullname,
      t.division_id,
      t.unit_id,
      aa.first_checkin,
      aa.last_checkout,
      s.schedule_name,
      COALESCE(s.work_start, ?) AS work_start_resolved,
      COALESCE(s.work_end,   ?) AS work_end_resolved,

      CASE WHEN aa.first_checkin IS NOT NULL OR aa.last_checkout IS NOT NULL THEN 1 ELSE 0 END AS present,

      GREATEST(
        TIMESTAMPDIFF(MINUTE, TIMESTAMP(?, COALESCE(s.work_start, ?)), aa.first_checkin),
        0
      ) AS late_minutes,

      GREATEST(
        TIMESTAMPDIFF(MINUTE, aa.last_checkout, TIMESTAMP(?, COALESCE(s.work_end, ?))),
        0
      ) AS early_minutes,

      ra.request_type,
      ra.request_status,

      CASE
        WHEN ra.request_type IS NOT NULL THEN CONCAT('APPROVED:', UPPER(ra.request_type))
        WHEN aa.first_checkin IS NULL AND aa.last_checkout IS NULL THEN 'ALPHA'
        WHEN aa.first_checkin IS NOT NULL AND aa.last_checkout IS NOT NULL THEN
          CASE
            WHEN TIME(aa.first_checkin) > COALESCE(s.work_start, ?) AND TIME(aa.last_checkout) < COALESCE(s.work_end, ?) THEN 'LATE & EARLY'
            WHEN TIME(aa.first_checkin) > COALESCE(s.work_start, ?) THEN 'LATE'
            WHEN TIME(aa.last_checkout)  < COALESCE(s.work_end, ?) THEN 'EARLY'
            ELSE 'OK'
          END
        WHEN aa.first_checkin IS NOT NULL THEN
          CASE WHEN TIME(aa.first_checkin) > COALESCE(s.work_start, ?) THEN 'LATE' ELSE 'OK' END
        WHEN aa.last_checkout IS NOT NULL THEN
          CASE WHEN TIME(aa.last_checkout) < COALESCE(s.work_end, ?) THEN 'EARLY' ELSE 'OK' END
        ELSE 'ALPHA'
      END AS status_label
    FROM team t
    LEFT JOIN sched s ON s.user_id = t.id
    LEFT JOIN aa    ON aa.user_id = t.id
    LEFT JOIN ra    ON ra.user_id = t.id
    ORDER BY t.fullname ASC
  `;

    const params = [
      // leader
      leaderId,

      // onlyUserIds (if any)
      ...onlyUserParams,

      // sched: DATE(?)
      d,

      // attendance window: [startOfDay, endOfDay]
      startOfDay,
      endOfDay,

      // requests overlap: DATE(?)
      d,

      // resolved window defaults
      workStart,
      workEnd,

      // late/early comparisons
      d,
      workStart,
      d,
      workEnd,

      // status checks
      workStart,
      workEnd,
      workStart,
      workEnd,
      workStart,
      workEnd,
    ];

    const [rows] = await this._db.execute(sql, params);

    return rows.map((r) => ({
      user_id: r.user_id,
      fullname: r.fullname,
      division_id: r.division_id,
      unit_id: r.unit_id,
      first_checkin: r.first_checkin,
      last_checkout: r.last_checkout,
      schedule_name: r.schedule_name || null, // should show "B2" for Mega that day
      work_start: r.work_start_resolved, // should be 14:30:00 if sched row matches
      work_end: r.work_end_resolved, // should be 21:30:00 if sched row matches
      present: !!r.present,
      late_minutes: Number(r.late_minutes ?? 0),
      early_minutes: Number(r.early_minutes ?? 0),
      request_type: r.request_type,
      request_status: r.request_status,
      status_label: r.status_label,
    }));
  }
}

module.exports = AttendanceReportService;
