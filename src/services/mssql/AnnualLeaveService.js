// src/services/mssql/AnnualLeaveService.js
const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class AnnualLeaveService {
  constructor() {
    this._db = database.getConnection();
  }

  /**
   * For the given year, ensure every user has exactly one balance row.
   * Inserts a new row for any (user_id, year) that’s missing.
   */
  async generateDailyBalances(year, defaultDays = 12) {
    // 1) load all users
    const [users] = await this._db.execute(`SELECT id FROM users`);

    // 2) load existing balances for that year
    const [existing] = await this._db.execute(
      `SELECT user_id FROM annual_leave_balances WHERE year = ?`,
      [year]
    );
    const have = new Set(existing.map((r) => r.user_id));

    // 3) for each user missing, insert one row with a fresh nanoid
    const insertSQL = `
      INSERT INTO annual_leave_balances
        (id, user_id, year, total_days, used_days, created_at)
      VALUES (?, ?, ?, ?, 0, NOW())
    `;
    for (const { id: userId } of users) {
      if (!have.has(userId)) {
        const newId = nanoid(16);
        const [res] = await this._db.execute(insertSQL, [
          newId,
          userId,
          year,
          defaultDays,
        ]);
        if (res.affectedRows !== 1) {
          throw new InvariantError(
            `Failed to seed leave balance for ${userId}@${year}`
          );
        }
      }
    }
  }
}

module.exports = AnnualLeaveService;
