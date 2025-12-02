// src/services/mssql/PayrollService.js
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");

class PayrollService {
  constructor() {
    this._db = database.getConnection();
  }

  /**
   * Get payroll details for a given year-month, e.g. "2025-05"
   * Applies per-date overrides from work_schedule_overrides if present,
   * sums late/early per user in CTE attl to avoid cartesian duplication,
   * and prorates absence. Caps total deduction at 30% of base salary.
   */
  async getPayrollByMonth(yearMonth) {
    const [year, month] = yearMonth.split("-");
    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-31`;

    const sql = `
      WITH calendar AS (
        SELECT DATE_ADD(?, INTERVAL seq.seqnum DAY) AS dt
        FROM (
          SELECT 0 AS seqnum UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
          UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
          UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11
          UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
          UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19
          UNION ALL SELECT 20 UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23
          UNION ALL SELECT 24 UNION ALL SELECT 25 UNION ALL SELECT 26 UNION ALL SELECT 27
          UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL SELECT 30
        ) AS seq
        WHERE DATE_ADD(?, INTERVAL seq.seqnum DAY) BETWEEN ? AND ?
      ),

      working_days AS (
        SELECT
          c.dt,
          u.id AS userId
        FROM users u
        JOIN calendar c   ON TRUE
        JOIN work_schedule_days wsd
          ON wsd.user_id = u.id
         AND WEEKDAY(c.dt) = wsd.weekday
        LEFT JOIN work_schedule_overrides wso
          ON wso.user_id       = u.id
         AND wso.scheduled_date = c.dt
        WHERE c.dt BETWEEN ? AND ?
          AND (wso.scheduled_date IS NULL
               OR wso.expected_checkin IS NOT NULL
               OR wso.expected_checkout IS NOT NULL)
      ),

      attendance_days AS (
        SELECT DISTINCT
          DATE(a.recorded_at) AS dt,
          a.user_id           AS userId
        FROM attendances a
        WHERE DATE(a.recorded_at) BETWEEN ? AND ?
      ),

      attl AS (
        -- akumulasi total late/early per user
        SELECT
          a.user_id AS userId,
          SUM(
            CASE WHEN a.type='checkin' THEN
              GREATEST(
                TIMESTAMPDIFF(
                  MINUTE,
                  CONCAT('2000-01-01 ',
                    COALESCE(wso.expected_checkin, ws.expected_checkin)
                  ),
                  CONCAT('2000-01-01 ', TIME(a.recorded_at))
                ),
                0
              )
            ELSE 0 END
          ) AS total_late_minutes,
          SUM(
            CASE WHEN a.type='checkout' THEN
              GREATEST(
                TIMESTAMPDIFF(
                  MINUTE,
                  CONCAT('2000-01-01 ', TIME(a.recorded_at)),
                  CONCAT('2000-01-01 ',
                    COALESCE(wso.expected_checkout, ws.expected_checkout)
                  )
                ),
                0
              )
            ELSE 0 END
          ) AS total_early_minutes
        FROM attendances a
        JOIN work_schedules ws
          ON ws.user_id = a.user_id
        LEFT JOIN work_schedule_overrides wso
          ON wso.user_id       = a.user_id
         AND DATE(a.recorded_at) = wso.scheduled_date
        WHERE DATE(a.recorded_at) BETWEEN ? AND ?
        GROUP BY a.user_id
      )

      SELECT
        u.id                          AS userId,
        u.fullname                    AS fullname,
        sr.base_monthly_salary        AS base_monthly_salary,
        sr.deduction_per_minute_late  AS deduction_per_minute_late,
        sr.deduction_per_minute_early AS deduction_per_minute_early,
        COALESCE(al.total_late_minutes,  0) AS total_late_minutes,
        COALESCE(al.total_early_minutes, 0) AS total_early_minutes,
        COUNT(DISTINCT wd.dt)           AS total_working_days,
        COUNT(DISTINCT ad.dt)           AS total_attended_days
      FROM users u
      JOIN work_schedules ws
        ON ws.user_id = u.id
      JOIN salary_rules sr
        ON sr.user_id = u.id
      LEFT JOIN attl al
        ON al.userId = u.id
      LEFT JOIN working_days wd
        ON wd.userId = u.id
      LEFT JOIN attendance_days ad
        ON ad.userId = u.id
      GROUP BY
        u.id, u.fullname,
        sr.base_monthly_salary,
        sr.deduction_per_minute_late,
        sr.deduction_per_minute_early,
        al.total_late_minutes,
        al.total_early_minutes
      ORDER BY u.fullname
    `;

    // bind parameters in order of appearance
    const binds = [
      startDate,
      startDate,
      startDate,
      endDate, // calendar CTE
      startDate,
      endDate, // working_days CTE
      startDate,
      endDate, // attendance_days CTE
      startDate,
      endDate, // attl CTE
    ];

    const [rows] = await this._db.execute(sql, binds);

    return rows.map((r) => {
      const {
        userId,
        fullname,
        base_monthly_salary,
        deduction_per_minute_late,
        deduction_per_minute_early,
        total_late_minutes,
        total_early_minutes,
        total_working_days,
        total_attended_days,
      } = r;

      const absentDays = total_working_days - total_attended_days;
      const dailySalary = base_monthly_salary / total_working_days;
      const deductionLate = total_late_minutes * deduction_per_minute_late;
      const deductionEarly = total_early_minutes * deduction_per_minute_early;
      const deductionAbs = absentDays * dailySalary;
      const rawDeduction = deductionLate + deductionEarly + deductionAbs;

      const maxDeduction = base_monthly_salary * 0.3;
      const totalDeduction = Math.min(rawDeduction, maxDeduction);
      const netSalary = base_monthly_salary - totalDeduction;

      return {
        userId,
        fullname,
        base_monthly_salary,
        total_late_minutes,
        total_early_minutes,
        total_working_days,
        total_attended_days,
        absent_days: absentDays,
        raw_deduction: rawDeduction,
        total_deduction: totalDeduction,
        net_salary: netSalary,
      };
    });
  }
}

module.exports = PayrollService;
