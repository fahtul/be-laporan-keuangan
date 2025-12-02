// src/services/mssql/WorkSchedulesService.js
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");

class WorkSchedulesService {
  constructor() {
    this._db = database.getConnection();
  }

  /**
   * Fetch all work schedules, including which weekdays (0=Sunday…6=Saturday) each applies to.
   */
  async getAllSchedules() {
    // 1) Load the base schedules
    const sql = `
      SELECT
        ws.user_id           AS userId,
        u.fullname           AS fullname,
        ws.expected_checkin  AS expected_checkin,
        ws.expected_checkout AS expected_checkout
      FROM work_schedules ws
      JOIN users u
        ON ws.user_id = u.id
      ORDER BY u.fullname
    `;
    const [rows] = await this._db.execute(sql);

    // 2) For each schedule, fetch its weekdays
    const schedules = [];
    for (const r of rows) {
      const [days] = await this._db.execute(
        `SELECT weekday FROM work_schedule_days WHERE user_id = ? ORDER BY weekday`,
        [r.userId]
      );
      schedules.push({
        userId: r.userId,
        fullname: r.fullname,
        expected_checkin: r.expected_checkin,
        expected_checkout: r.expected_checkout,
        weekdays: days.map((d) => d.weekday), // e.g. [0,1,2,3,4,5,6]
      });
    }
    return schedules;
  }

  /**
   * Add a new work schedule *and* seed it for all seven days of the week.
   */
  async addSchedule({ userId, expected_checkin, expected_checkout }) {
    // 1) Insert into work_schedules
    const insertSch = `
      INSERT INTO work_schedules (user_id, expected_checkin, expected_checkout)
      VALUES (?, ?, ?)
    `;
    await this._db.execute(insertSch, [
      userId,
      expected_checkin,
      expected_checkout,
    ]);

    // 2) Insert one row per weekday 0–6
    const insertDay = `
      INSERT INTO work_schedule_days (user_id, weekday)
      VALUES (?, ?)
    `;
    for (let d = 0; d < 7; d++) {
      await this._db.execute(insertDay, [userId, d]);
    }
  }

  async getSchedule(userId) {
    const [rows] = await this._db.execute(
      `SELECT 
         ws.user_id       AS userId,
         ws.expected_checkin,
         ws.expected_checkout,
         GROUP_CONCAT(wsd.weekday ORDER BY wsd.weekday) AS weekdays
       FROM work_schedules ws
       LEFT JOIN work_schedule_days wsd
         ON ws.user_id = wsd.user_id
       WHERE ws.user_id = ?
       GROUP BY ws.user_id, ws.expected_checkin, ws.expected_checkout`,
      [userId]
    );
    if (!rows.length) {
      throw new InvariantError("Schedule not found");
    }

    // Parse the comma-separated weekdays back into an array of ints
    const rec = rows[0];
    return {
      userId: rec.userId,
      expected_checkin: rec.expected_checkin,
      expected_checkout: rec.expected_checkout,
      weekdays: rec.weekdays
        ? rec.weekdays.split(",").map((d) => +d)
        : [0, 1, 2, 3, 4, 5, 6],
    };
  }

  /**
   * Get the expected times for a user on a specific date.
   * Returns { expected_checkin, expected_checkout }.
   */
  async getScheduleForDate(userId, date) {
    // 1) Try override
    const [ovrRows] = await this._db.execute(
      `SELECT expected_checkin, expected_checkout
     FROM work_schedule_overrides
     WHERE user_id = ? AND scheduled_date = ?`,
      [userId, date]
    );
    if (
      ovrRows.length &&
      (ovrRows[0].expected_checkin || ovrRows[0].expected_checkout)
    ) {
      return {
        expected_checkin: ovrRows[0].expected_checkin,
        expected_checkout: ovrRows[0].expected_checkout,
      };
    }

    // 2) Fallback to default
    const [defRows] = await this._db.execute(
      `SELECT expected_checkin, expected_checkout
     FROM work_schedules
     WHERE user_id = ?`,
      [userId]
    );
    if (!defRows.length) {
      throw new InvariantError("Schedule not found");
    }
    return defRows[0];
  }

  async getOverridesForUserMonth(userId, yearMonth) {
    const [year, month] = yearMonth.split("-");
    const start = `${year}-${month}-01`;
    const end = `${year}-${month}-31`;

    const [rows] = await this._db.execute(
      `SELECT scheduled_date, expected_checkin, expected_checkout
       FROM work_schedule_overrides
       WHERE user_id = ? 
         AND scheduled_date BETWEEN ? AND ?
       ORDER BY scheduled_date`,
      [userId, start, end]
    );

    return rows;
  }

  /**
   * Bulk-create overrides for each day of a given year-month.
   * Optionally takes `weekdays` (0=Sun…6=Sat) to restrict which days get overrides.
   */
  async bulkCreateOverrides(userId, yearMonth, weekdays = null) {
    // 1) Build start/end
    const [year, month] = yearMonth.split("-");
    const start = parseISO(`${year}-${month}-01`);
    const end = parseISO(`${year}-${month}-01`);
    end.setMonth(end.getMonth() + 1, 0); // last day of month

    // 2) Get default times from work_schedules
    const def = await this.getSchedule(userId);
    const { expected_checkin, expected_checkout } = def;

    // 3) Build array of dates to insert
    const allDates = eachDayOfInterval({ start, end })
      .map((d) => ({
        dateStr: format(d, "yyyy-MM-dd"),
        weekday: d.getDay(),
      }))
      .filter(
        ({ weekday }) =>
          // if weekdays filter given, only include those; else include all
          !Array.isArray(weekdays) || weekdays.includes(weekday)
      );

    if (allDates.length === 0) {
      throw new InvariantError("No days matched for bulk override");
    }

    // 4) Insert or upsert each override
    const placeholders = allDates.map(() => "(?, ?, ?, ?)").join(", ");
    const values = allDates.flatMap(({ dateStr }) => [
      userId,
      dateStr,
      expected_checkin,
      expected_checkout,
    ]);

    // MySQL: ON DUPLICATE KEY UPDATE to upsert
    const sql = `
      INSERT INTO work_schedule_overrides
        (user_id, scheduled_date, expected_checkin, expected_checkout)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        expected_checkin=VALUES(expected_checkin),
        expected_checkout=VALUES(expected_checkout)
    `;
    await this._db.execute(sql, values);
  }

  /**
   * Update the times for a schedule. We leave the weekdays table untouched
   * (since by default it's still all 0–6 unless you later add endpoints to modify it).
   */
  async updateSchedule(userId, { expected_checkin, expected_checkout }) {
    const sql = `
      UPDATE work_schedules
      SET expected_checkin = ?, expected_checkout = ?
      WHERE user_id = ?
    `;
    const [res] = await this._db.execute(sql, [
      expected_checkin,
      expected_checkout,
      userId,
    ]);
    if (res.affectedRows === 0) {
      throw new InvariantError("Schedule not found");
    }
  }

  /**
   * Delete a schedule and its weekdays (FK CASCADE handles days).
   */
  async deleteSchedule(userId) {
    await this._db.execute(`DELETE FROM work_schedules WHERE user_id = ?`, [
      userId,
    ]);
  }

  /**
   * Bulk‐set per‐date checkin/checkout overrides for a given month.
   * @param {string} userId
   * @param {string} yearMonth   e.g. "2025-06"
   * @param {Array<{ date: string, expected_checkin: string, expected_checkout: string }>} overrides
   */
  async setOverridesForMonth(userId, yearMonth, overrides) {
    if (!Array.isArray(overrides) || overrides.length === 0) {
      throw new InvariantError("Overrides array must be non-empty");
    }
    // validate each override has date in the same month
    const [year, month] = yearMonth.split("-");
    const monthPrefix = `${year}-${month}-`;
    for (const o of overrides) {
      if (!o.date.startsWith(monthPrefix)) {
        throw new InvariantError(`Date ${o.date} not in month ${yearMonth}`);
      }
    }

    // Build placeholders
    // Each row: (user_id, scheduled_date, expected_checkin, expected_checkout)
    const placeholders = overrides.map(() => "(?, ?, ?, ?)").join(", ");
    const values = overrides.flatMap(
      ({ date, expected_checkin, expected_checkout }) => [
        userId,
        date,
        expected_checkin.length === 5
          ? `${expected_checkin}:00`
          : expected_checkin,
        expected_checkout.length === 5
          ? `${expected_checkout}:00`
          : expected_checkout,
      ]
    );

    const sql = `
      INSERT INTO work_schedule_overrides
        (user_id, scheduled_date, expected_checkin, expected_checkout)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        expected_checkin   = VALUES(expected_checkin),
        expected_checkout  = VALUES(expected_checkout)
    `;
    await this._db.execute(sql, values);
  }
}

module.exports = WorkSchedulesService;
