const { nanoid } = require("nanoid");
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");

class ActivityService {
  constructor() {
    this._db = database.getConnection();
  }

  async addActivity({ activity_name, owner_id }) {
    const id = nanoid(16);
    const query =
      "INSERT INTO activity (id, activity_name, owner_id) VALUES (?, ?, ?)";
    const values = [id, activity_name, owner_id];
    console.log(`Executing query: ${query}`);
    console.log(`With values: ${values}`);
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Aktivitas gagal ditambahkan.");
    }

    return id;
  }

  async getActivities(limit, offset, { owner_id, activity_id, search } = {}) {
    let query = `
      SELECT 
        activity.*, 
        users.fullname AS owner_name 
      FROM activity 
      JOIN users ON activity.owner_id = users.id 
      WHERE 1=1
    `;
    const values = [];

    if (owner_id) {
      query += " AND activity.owner_id = ?";
      values.push(owner_id);
    }

    if (activity_id) {
      query += " AND activity.id = ?";
      values.push(activity_id);
    }

    if (search) {
      query += " AND activity.activity_name LIKE ?";
      values.push(`%${search}%`);
    }

    query += " LIMIT ? OFFSET ?";
    values.push(limit, offset);

    const [results] = await this._db.execute(query, values);
    return results;
  }
  async getActivityCount({ owner_id, activity_id, search } = {}) {
    let query = `SELECT COUNT(*) AS total FROM activity WHERE 1=1`;
    const values = [];

    if (owner_id) {
      query += " AND owner_id = ?";
      values.push(owner_id);
    }

    if (activity_id) {
      query += " AND id = ?";
      values.push(activity_id);
    }

    if (search) {
      query += " AND activity_name LIKE ?";
      values.push(`%${search}%`);
    }

    const [result] = await this._db.execute(query, values);
    return parseInt(result[0].total, 10);
  }

  async getActivityById(id) {
    const query = "SELECT * FROM activity WHERE id = ?";
    const [results] = await this._db.execute(query, [id]);

    if (results.length === 0) {
      throw new NotFoundError("Aktivitas tidak ditemukan.");
    }

    return results[0];
  }

  async updateActivityById(id, { activity_name, owner_id }) {
    const query =
      "UPDATE activity SET activity_name = ?, owner_id = ? WHERE id = ?";
    const [result] = await this._db.execute(query, [
      activity_name,
      owner_id,
      id,
    ]);

    if (result.affectedRows === 0) {
      throw new NotFoundError(
        "Gagal memperbarui aktivitas. ID tidak ditemukan."
      );
    }
  }

  async deleteActivityById(id) {
    const query = "DELETE FROM activity WHERE id = ?";
    const [result] = await this._db.execute(query, [id]);

    if (result.affectedRows === 0) {
      throw new NotFoundError("Aktivitas gagal dihapus. ID tidak ditemukan.");
    }
  }
}

module.exports = ActivityService;
