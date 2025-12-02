// src/services/AttendanceSusulanService.js
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database"); // your shared DB module

class AttendanceSusulanService {
  constructor() {
    this._db = database.getConnection();
  }

  async createRequest({
    userId,
    type,
    attendance_date,
    checkin_time = null,
    checkout_time = null,
    reason = "",
  }) {
    const query = `
      INSERT INTO attendance_susulan
        (user_id, type, attendance_date, checkin_time, checkout_time, reason, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
    `;
    const values = [
      userId,
      type,
      attendance_date,
      checkin_time,
      checkout_time,
      reason,
    ];
    const [result] = await this._db.execute(query, values);
    if (result.affectedRows !== 1) {
      throw new InvariantError("Gagal membuat request susulan.");
    }
    return result.insertId;
  }

  async getRequestById(id) {
    const [rows] = await this._db.execute(
      "SELECT * FROM attendance_susulan WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      throw new InvariantError("Request susulan tidak ditemukan.");
    }
    return rows[0];
  }

  async updateRequestStatus(id, { status, note }) {
    const query = `
      UPDATE attendance_susulan
      SET status     = ?,
          note       = ?,
          updated_at = NOW()
      WHERE id = ? AND status = 'pending'
    `;
    const [result] = await this._db.execute(query, [status, note || null, id]);
    if (result.affectedRows === 0) {
      throw new InvariantError(
        "Gagal memperbarui status (mungkin sudah diproses)."
      );
    }
  }

  /**
   * Fetch susulan records.
   * If isAdmin, returns all; otherwise only those belonging to userId.
   */
  async getSusulan(userId, isAdmin) {
    const params = [];
    let query = `
    SELECT
      a.id,
      a.user_id,
      u.fullname AS user_name,      -- pull in the user's full name
      a.type,
      a.attendance_date,
      a.checkin_time,
      a.checkout_time,
      a.reason,
      a.status,
      a.note,
      a.created_at,
      a.updated_at
    FROM attendance_susulan a
    JOIN users u
      ON a.user_id = u.id
    WHERE 1=1
  `;

    if (!isAdmin) {
      query += " AND a.user_id = ?";
      params.push(userId);
    }

    query += " ORDER BY a.created_at DESC";

    const [rows] = await this._db.execute(query, params);
    return rows;
  }
}

module.exports = AttendanceSusulanService;
