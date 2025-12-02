const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");

class LeaveRequestsService {
  constructor() {
    this._db = database.getConnection();
  }

  // Ajukan cuti
  async requestLeave({ userId, type, start_date, end_date, reason }) {
    const sql = `
      INSERT INTO leave_requests
        (user_id, type, start_date, end_date, reason)
      VALUES (?, ?, ?, ?, ?)
    `;
    // now none of these can be undefined
    const params = [userId, type, start_date, end_date, reason];
    await this._db.execute(sql, params);
  }

  // Daftar seluruh permohonan (admin) atau user‐specific
  async getLeaves({ userId = null, status = null }) {
    let sql = `
      SELECT lr.*, u.fullname
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
    `;
    const where = [];
    const params = [];
    if (userId) {
      where.push("lr.user_id = ?");
      params.push(userId);
    }
    if (status) {
      where.push("lr.status = ?");
      params.push(status);
    }
    if (where.length) {
      sql += " WHERE " + where.join(" AND ");
    }
    sql += " ORDER BY lr.created_at DESC";
    const [rows] = await this._db.execute(sql, params);
    return rows;
  }

  // Ambil satu permohonan
  async getLeaveById(id) {
    const sql = `
      SELECT lr.*, u.fullname
      FROM leave_requests lr
      JOIN users u ON lr.user_id = u.id
      WHERE lr.id = ?
    `;
    const [rows] = await this._db.execute(sql, [id]);
    if (!rows.length) throw new InvariantError("Leave request not found");
    return rows[0];
  }

  // Approve atau reject
  async _updateApproval(id, level, approverId, approved) {
    // level: 'unit' | 'division' | 'director'
    const statusFlow = {
      unit: approved ? "pending_division" : "rejected",
      division: approved ? "pending_director" : "rejected",
      director: approved ? "approved" : "rejected",
    };
    const colApprover = `${level}_approver_id`;
    const colAt = `${level}_approved_at`;
    const nextStatus = statusFlow[level];
    const sql = `
      UPDATE leave_requests
      SET ${colApprover} = ?, ${colAt} = NOW(), status = ?
      WHERE id = ? AND status LIKE ?
    `;
    // ensure correct previous status
    const expectedStatus = {
      unit: "pending_unit",
      division: "pending_division",
      director: "pending_director",
    }[level];
    const [res] = await this._db.execute(sql, [
      approverId,
      nextStatus,
      id,
      expectedStatus,
    ]);
    if (res.affectedRows === 0) {
      throw new InvariantError(
        "Cannot " + (approved ? "approve" : "reject") + ` at ${level} stage`
      );
    }
  }

  async approveUnit(id, approverId) {
    await this._updateApproval(id, "unit", approverId, true);
  }
  async rejectUnit(id, approverId) {
    await this._updateApproval(id, "unit", approverId, false);
  }
  async approveDivision(id, approverId) {
    await this._updateApproval(id, "division", approverId, true);
  }
  async rejectDivision(id, approverId) {
    await this._updateApproval(id, "division", approverId, false);
  }
  async approveDirector(id, approverId) {
    await this._updateApproval(id, "director", approverId, true);
  }
  async rejectDirector(id, approverId) {
    await this._updateApproval(id, "director", approverId, false);
  }
}

module.exports = LeaveRequestsService;
