const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");

class SalaryRulesService {
  constructor() {
    this._db = database.getConnection();
  }

  async getAllRules() {
    const sql = `
    SELECT
      sr.user_id                     AS userId,
      u.fullname                     AS fullname,
      sr.base_monthly_salary         AS base_monthly_salary,
      sr.deduction_per_minute_late   AS deduction_per_minute_late,
      sr.deduction_per_minute_early  AS deduction_per_minute_early
    FROM salary_rules sr
    JOIN users u ON sr.user_id = u.id
    ORDER BY u.fullname
  `;
    const [rows] = await this._db.execute(sql);
    return rows.map((r) => ({
      userId: r.userId,
      fullname: r.fullname,
      base_monthly_salary: r.base_monthly_salary,
      deduction_per_minute_late: r.deduction_per_minute_late,
      deduction_per_minute_early: r.deduction_per_minute_early,
    }));
  }

  async addRule({
    userId,
    base_monthly_salary,
    deduction_per_minute_late,
    deduction_per_minute_early,
  }) {
    const sql = `
      INSERT INTO salary_rules
        (user_id, base_monthly_salary, deduction_per_minute_late, deduction_per_minute_early)
      VALUES (?, ?, ?, ?)
    `;
    await this._db.execute(sql, [
      userId,
      base_monthly_salary,
      deduction_per_minute_late,
      deduction_per_minute_early,
    ]);
  }

  async getRule(userId) {
    const sql = `
      SELECT
        sr.user_id                    AS userId,
        u.fullname                    AS fullname,
        sr.base_monthly_salary        AS base_monthly_salary,
        sr.deduction_per_minute_late  AS deduction_per_minute_late,
        sr.deduction_per_minute_early AS deduction_per_minute_early
      FROM salary_rules sr
      JOIN users u
        ON sr.user_id = u.id
      WHERE sr.user_id = ?
    `;
    const [rows] = await this._db.execute(sql, [userId]);
    if (rows.length === 0) {
      throw new InvariantError("Salary rule not found");
    }
    return rows[0];
  }

  async updateRule(
    userId,
    {
      base_monthly_salary,
      deduction_per_minute_late,
      deduction_per_minute_early,
    }
  ) {
    const sql = `
      UPDATE salary_rules
      SET base_monthly_salary = ?, deduction_per_minute_late = ?, deduction_per_minute_early = ?
      WHERE user_id = ?
    `;
    const [res] = await this._db.execute(sql, [
      base_monthly_salary,
      deduction_per_minute_late,
      deduction_per_minute_early,
      userId,
    ]);
    if (res.affectedRows === 0)
      throw new InvariantError("Salary rule not found");
  }

  async deleteRule(userId) {
    await this._db.execute(`DELETE FROM salary_rules WHERE user_id = ?`, [
      userId,
    ]);
  }
}

module.exports = SalaryRulesService;
