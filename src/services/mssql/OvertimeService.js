const database = require("../../database"); // your existing db connector

function parseMeta(meta_json) {
  if (!meta_json) return {};
  try {
    const obj =
      typeof meta_json === "string" ? JSON.parse(meta_json) : meta_json;
    return obj && typeof obj === "object" ? obj : {};
  } catch (_e) {
    return {};
  }
}

/**
 * Helper to compute hours:
 * 1) prefer meta.audit_ot_hours
 * 2) else derive from OT line: amount / rate
 */
function deriveHours(meta, otAmount, otRate) {
  const h1 = Number(meta?.audit_ot_hours);
  if (!Number.isNaN(h1) && h1 > 0) return h1;

  const amt = Number(otAmount || 0);
  const rate = Number(otRate || 0);
  if (rate > 0 && amt > 0) {
    return +(amt / rate).toFixed(2);
  }
  return 0;
}

class OvertimeService {
  constructor() {
    this._db = database.getConnection();
  }

  /**
   * Returns per-user OT summary for specific (year, month)
   * - Pulls salary_records + users
   * - Left-joins salary_details for code='OT'
   * - Computes hours from meta_json or amount/rate
   */
  async getMonthlySummary({ year, month, status }) {
    month = 9;
    const params = [year, month];
    let statusFilter = "";
    if (status) {
      statusFilter = " AND sr.status = ? ";
      params.push(status);
    } else {
      // usually we don’t show draft in recap; tweak as you like:
      statusFilter = " AND sr.status IN ('locked','approved','published') ";
    }

    const sql = `
      SELECT
        sr.id AS record_id,
        sr.user_id,
        u.fullname,
        u.division_id,
        u.unit_id,
        sr.year, sr.month, sr.status,
        sr.basic_salary,
        sr.present_days, sr.working_days,
        sr.gross_earn, sr.total_ded, sr.net_pay,
        sr.meta_json,
        ot.rate AS ot_rate,
        ot.amount AS ot_amount
      FROM salary_records sr
      JOIN users u ON u.id = sr.user_id
      LEFT JOIN salary_details ot
        ON ot.record_id = sr.id AND ot.code = 'OT'
      WHERE sr.year = ? AND sr.month = ? ${statusFilter}
      ORDER BY u.fullname ASC
    `;

    const [rows] = await this._db.query(sql, params);

    const summary = rows.map((r) => {
      const meta = parseMeta(r.meta_json);
      const hours = deriveHours(meta, r.ot_amount, r.ot_rate);
      const dayCount = Array.isArray(meta?.overtime_by_date)
        ? meta.overtime_by_date.length
        : 0;

      return {
        record_id: r.record_id,
        user_id: r.user_id,
        fullname: r.fullname,
        division_id: r.division_id,
        unit_id: r.unit_id,
        year: r.year,
        month: r.month,
        status: r.status,
        hourly_ot_rate: Number(r.ot_rate || meta?.hourly_ot_rate || 0),
        overtime_hours: hours,
        overtime_days: dayCount,
        overtime_amount: Number(r.ot_amount || 0),
        // convenience fields for table footer / cross-check
        gross_earn: Number(r.gross_earn || 0),
        total_ded: Number(r.total_ded || 0),
        net_pay: Number(r.net_pay || 0),
      };
    });

    // totals for footer
    const totals = summary.reduce(
      (acc, it) => {
        acc.users += 1;
        acc.overtime_hours += it.overtime_hours;
        acc.overtime_amount += it.overtime_amount;
        return acc;
      },
      { users: 0, overtime_hours: 0, overtime_amount: 0 }
    );

    return { year, month, count: summary.length, totals, items: summary };
  }

  /**
   * Returns one user’s overtime details for (year, month)
   * - Merges: OT line (rate/amount) + overtime_by_date (per-day & requests)
   */
  async getUserOvertimeDetail({ userId, year, month }) {
    const sql = `
      SELECT
        sr.id AS record_id, sr.status,
        sr.user_id, u.fullname,
        sr.year, sr.month,
        sr.meta_json,
        ot.rate AS ot_rate,
        ot.amount AS ot_amount
      FROM salary_records sr
      JOIN users u ON u.id = sr.user_id
      LEFT JOIN salary_details ot
        ON ot.record_id = sr.id AND ot.code = 'OT'
      WHERE sr.user_id = ? AND sr.year = ? AND sr.month = ?
      LIMIT 1
    `;
    const [rows] = await this._db.query(sql, [userId, year, month]);
    if (rows.length === 0) {
      return {
        user_id: userId,
        year,
        month,
        record: null,
        overtime: { hourly_rate: 0, total_hours: 0, total_amount: 0, days: [] },
      };
    }

    const r = rows[0];
    const meta = parseMeta(r.meta_json);
    const hourlyRate = Number(r.ot_rate || meta?.hourly_ot_rate || 0);
    const totalAmount = Number(r.ot_amount || 0);
    const totalHours = deriveHours(meta, totalAmount, hourlyRate);

    // Normalize the day list
    const dayList = Array.isArray(meta?.overtime_by_date)
      ? meta.overtime_by_date
      : [];
    const days = dayList.map((d) => ({
      date: d.date, // "YYYY-MM-DD"
      hours: Number(d.hours || 0),
      amount: Number(d.amount || 0),
      requests: Array.isArray(d.requests)
        ? d.requests.map((q) => ({
            id: q.id,
            start_time: q.start_time,
            end_time: q.end_time,
            duration_hours: Number(q.duration_hours || 0),
            note: q.note || null,
          }))
        : [],
    }));

    return {
      user_id: r.user_id,
      fullname: r.fullname,
      year: r.year,
      month: r.month,
      record_id: r.record_id,
      status: r.status,
      overtime: {
        hourly_rate: hourlyRate,
        total_hours: totalHours,
        total_amount: totalAmount,
        day_count: days.length,
        days,
      },
    };
  }

  /**
   * Yearly grid: each row per (user, month) with OT amount/hours.
   * Good for charts or pivot on FE.
   */
  async getYearlyByMonthSummary({ year, status }) {
    const params = [year];
    let statusFilter = "";
    if (status) {
      statusFilter = " AND sr.status = ? ";
      params.push(status);
    } else {
      statusFilter = " AND sr.status IN ('locked','approved','published') ";
    }

    const sql = `
      SELECT
        sr.id AS record_id,
        sr.user_id, u.fullname,
        sr.year, sr.month, sr.status,
        sr.meta_json,
        ot.rate AS ot_rate, ot.amount AS ot_amount
      FROM salary_records sr
      JOIN users u ON u.id = sr.user_id
      LEFT JOIN salary_details ot
        ON ot.record_id = sr.id AND ot.code = 'OT'
      WHERE sr.year = ? ${statusFilter}
      ORDER BY u.fullname ASC, sr.month ASC
    `;
    const [rows] = await this._db.query(sql, params);

    return rows.map((r) => {
      const meta = parseMeta(r.meta_json);
      const hours = deriveHours(meta, r.ot_amount, r.ot_rate);
      return {
        record_id: r.record_id,
        user_id: r.user_id,
        fullname: r.fullname,
        year: r.year,
        month: r.month,
        status: r.status,
        hourly_ot_rate: Number(r.ot_rate || meta?.hourly_ot_rate || 0),
        overtime_hours: hours,
        overtime_amount: Number(r.ot_amount || 0),
      };
    });
  }

  async getUnitSummary({ year, month, status }) {
    const params = [year, month];
    let statusFilter = "";
    if (status) {
      statusFilter = " AND sr.status = ? ";
      params.push(status);
    } else {
      statusFilter = " AND sr.status IN ('locked','approved','published') ";
    }

    const sql = `
    SELECT
      u.unit_id,
      un.name AS unit_name,
      COUNT(DISTINCT sr.user_id) AS users,
      SUM(ot.amount) AS overtime_amount,
      SUM(
        CASE
          WHEN ot.rate > 0 THEN ot.amount / ot.rate
          ELSE JSON_EXTRACT(sr.meta_json, '$.audit_ot_hours')
        END
      ) AS overtime_hours
    FROM salary_records sr
    JOIN users u ON u.id = sr.user_id
    LEFT JOIN units un ON un.id = u.unit_id
    LEFT JOIN salary_details ot
      ON ot.record_id = sr.id AND ot.code = 'OT'
    WHERE sr.year = ? AND sr.month = ? ${statusFilter}
    GROUP BY u.unit_id, un.name
    ORDER BY un.name ASC
  `;

    const [rows] = await this._db.query(sql, params);

    const summary = rows.map((r) => ({
      unit_id: r.unit_id,
      unit_name: r.unit_name || "(Tanpa Unit)",
      users: Number(r.users || 0),
      overtime_hours: Number(r.overtime_hours || 0),
      overtime_amount: Number(r.overtime_amount || 0),
    }));

    const totals = summary.reduce(
      (acc, it) => {
        acc.units += 1;
        acc.users += it.users;
        acc.overtime_hours += it.overtime_hours;
        acc.overtime_amount += it.overtime_amount;
        return acc;
      },
      { units: 0, users: 0, overtime_hours: 0, overtime_amount: 0 }
    );

    return { year, month, count: summary.length, totals, items: summary };
  }

  async getUnitDetailSummary({ unitId, year, month, status }) {
    const params = [unitId, year, month];
    let statusFilter = "";
    if (status) {
      statusFilter = " AND sr.status = ? ";
      params.push(status);
    } else {
      statusFilter = " AND sr.status IN ('locked','approved','published') ";
    }

    const sql = `
    SELECT
      sr.id AS record_id,
      sr.user_id,
      u.fullname,
      u.unit_id,
      un.name AS unit_name,
      sr.year, sr.month, sr.status,
      ot.rate AS ot_rate,
      ot.amount AS ot_amount,
      sr.meta_json
    FROM salary_records sr
    JOIN users u ON u.id = sr.user_id
    LEFT JOIN units un ON un.id = u.unit_id
    LEFT JOIN salary_details ot
      ON ot.record_id = sr.id AND ot.code = 'OT'
    WHERE u.unit_id = ? AND sr.year = ? AND sr.month = ? ${statusFilter}
    ORDER BY u.fullname ASC
  `;

    const [rows] = await this._db.query(sql, params);

    const items = rows.map((r) => {
      const meta = parseMeta(r.meta_json);
      const hours = deriveHours(meta, r.ot_amount, r.ot_rate);

      return {
        record_id: r.record_id,
        user_id: r.user_id,
        fullname: r.fullname,
        unit_id: r.unit_id,
        unit_name: r.unit_name || "(Tanpa Unit)",
        year: r.year,
        month: r.month,
        status: r.status,
        hourly_ot_rate: Number(r.ot_rate || meta?.hourly_ot_rate || 0),
        overtime_hours: hours,
        overtime_amount: Number(r.ot_amount || 0),
      };
    });

    const totals = items.reduce(
      (acc, it) => {
        acc.users += 1;
        acc.overtime_hours += it.overtime_hours;
        acc.overtime_amount += it.overtime_amount;
        return acc;
      },
      { users: 0, overtime_hours: 0, overtime_amount: 0 }
    );

    const unitName = items[0]?.unit_name || "(Tanpa Unit)";
    return { unit_id: unitId, unit_name: unitName, year, month, totals, items };
  }
}

module.exports = OvertimeService;
