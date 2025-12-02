const { nanoid } = require("nanoid");
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");

class AbsentService {
  constructor() {
    this._db = database.getConnection();
  }

  // Add new absent
  async addAbsent({ activity_id, owner_id, description }) {
    const id = nanoid(16);
    const query = `
      INSERT INTO absent (id, activity_id, owner_id, description)
      VALUES (?, ?, ?, ?)`;
    const values = [id, activity_id, owner_id, description];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Absen gagal ditambahkan.");
    }

    return id;
  }

  // Get all absents with optional filters
  async getAbsents(limit, offset, { owner_id, activity_id, search } = {}) {
    const limitParse = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
    const offsetParse = Math.max(0, parseInt(offset, 10) || 0);
  
    let query = `
      SELECT absent.*, activity.activity_name, users.fullname AS owner_name
      FROM absent 
      JOIN activity ON absent.activity_id = activity.id 
      JOIN users ON absent.owner_id = users.id
      WHERE 1=1
    `;
    const values = [];
  
    if (owner_id) {
      query += " AND absent.owner_id = ?";
      values.push(owner_id);
    }
  
    if (activity_id) {
      query += " AND absent.activity_id = ?";
      values.push(activity_id);
    }
  
    if (search) {
      query += " AND activity.activity_name LIKE ?";
      values.push(`%${search}%`);
    }
  
    // 🔥 Inline LIMIT & OFFSET for compatibility across environments
    query += ` ORDER BY absent.created_at DESC LIMIT ${limitParse} OFFSET ${offsetParse}`;
  
    console.log("Executing query:", query);
    console.log("With values:", values);
  
    const [results] = await this._db.execute(query, values);
    return results;
  }
  

  async getAbsentCount({ activity_id, search } = {}) {
    let query = `
      SELECT COUNT(*) AS total 
      FROM absent 
      JOIN activity ON absent.activity_id = activity.id 
      WHERE 1=1
    `;
    const values = [];

    if (activity_id) {
      query += " AND absent.activity_id = ?";
      values.push(activity_id);
    }

    if (search) {
      query += " AND activity.activity_name LIKE ?";
      values.push(`%${search}%`);
    }

    const [result] = await this._db.execute(query, values);
    return parseInt(result[0].total, 10);
  }

  // Get single absent by id
  async getAbsentById(id) {
    const query = "SELECT * FROM absent WHERE id = ?";
    const [results] = await this._db.execute(query, [id]);

    if (results.length === 0) {
      throw new NotFoundError("Absen tidak ditemukan.");
    }

    return results[0];
  }

  // Update absent
  async updateAbsentById(id, { activity_id, owner_id, description }) {
    const query = `
      UPDATE absent
      SET activity_id = ?, owner_id = ?, description = ?
      WHERE id = ?`;
    const [result] = await this._db.execute(query, [
      activity_id,
      owner_id,
      description,
      id,
    ]);

    if (result.affectedRows === 0) {
      throw new NotFoundError("Gagal memperbarui absen. ID tidak ditemukan.");
    }
  }

  // Delete absent
  async deleteAbsentById(id) {
    const query = "DELETE FROM absent WHERE id = ?";
    const [result] = await this._db.execute(query, [id]);

    if (result.affectedRows === 0) {
      throw new NotFoundError("Absen gagal dihapus. ID tidak ditemukan.");
    }
  }
}

module.exports = AbsentService;
