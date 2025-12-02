const { nanoid } = require("nanoid");
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");

class WorkScheduleService {
  constructor() {
    this._db = database.getConnection();
  }

  async createCategory({ name, description, time_start, time_end }) {
    const id = nanoid(16);
    const query = `
      INSERT INTO schedule_categories (id, name, description, time_start, time_end)
      VALUES (?, ?, ?, ?, ?)`;

    const values = [id, name, description || null, time_start, time_end];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Kategori gagal ditambahkan.");
    }

    return id;
  }

  // Expecting table:
  // user_schedules(id, user_id, date, category_id, is_overtime TINYINT(1), ...)
  // Unique: (user_id, date, is_overtime)

  // Usage examples for overtime detection (pick one):
  // 1) Put is_overtime directly in each assignment item
  //    { date: '2025-10-01', category_id: 'CAT-A', is_overtime: true }
  //
  // 2) Pass an overtimeMap: { 'cat-overtime': true, 'cat-shift': false }
  // 3) Pass a resolveIsOvertime(category_id) => boolean

  async assignMonthlySchedules(
    { user_id, assignments },
    {
      logger = console,
      logExisting = false,
      // optional helpers for determining overtime per category
      overtimeMap = null, // e.g., { 'cat-overtime': true }
      resolveIsOvertime = null, // (category_id) => boolean
    } = {}
  ) {
    const conn = await this._db.getConnection();
    const summary = { inserted: 0, skipped: 0 };

    // helper to decide the is_overtime flag for an assignment
    const asOvertime = (a) => {
      if (typeof a.is_overtime === "boolean") return a.is_overtime;
      if (
        overtimeMap &&
        Object.prototype.hasOwnProperty.call(overtimeMap, a.category_id)
      ) {
        return !!overtimeMap[a.category_id];
      }
      if (typeof resolveIsOvertime === "function") {
        return !!resolveIsOvertime(a.category_id);
      }
      // default: treat as regular if unknown
      return false;
    };

    try {
      await conn.beginTransaction();

      for (const a of assignments) {
        const { date, category_id } = a;
        const isOvertime = asOvertime(a) ? 1 : 0;
        const id = nanoid(16);

        // Allows one regular (is_overtime=0) and one overtime (is_overtime=1) per day
        const [res] = await conn.execute(
          `INSERT IGNORE INTO user_schedules (id, user_id, date, category_id, is_overtime)
         VALUES (?, ?, ?, ?, ?)`,
          [id, user_id, date, category_id, isOvertime]
        );

        if (res.affectedRows === 1) {
          summary.inserted += 1;
          logger.info?.(
            `[schedules] inserted: user=${user_id} date=${date} category=${category_id} isOvertime=${isOvertime} id=${id}`
          );
        } else {
          summary.skipped += 1;

          if (logExisting) {
            // Show the existing row for the same (user_id, date, is_overtime)
            const [rows] = await conn.execute(
              `SELECT id, category_id, is_overtime
               FROM user_schedules
              WHERE user_id = ? AND date = ? AND is_overtime = ?
              LIMIT 1`,
              [user_id, date, isOvertime]
            );
            const ex = rows?.[0];
            logger.info?.(
              `[schedules] skipped (exists same kind): user=${user_id} date=${date} requestedCategory=${category_id} isOvertime=${isOvertime}` +
                (ex
                  ? ` existingId=${ex.id} existingCategory=${ex.category_id}`
                  : "")
            );
          } else {
            logger.info?.(
              `[schedules] skipped (exists same kind): user=${user_id} date=${date} requestedCategory=${category_id} isOvertime=${isOvertime}`
            );
          }
        }
      }

      await conn.commit();
      logger.info?.(
        `[schedules] done: user=${user_id} inserted=${summary.inserted} skipped=${summary.skipped}`
      );
      return summary;
    } catch (err) {
      await conn.rollback();
      logger.error?.(
        `[schedules] error: user=${user_id} inserted=${summary.inserted} skipped=${summary.skipped} ->`,
        err
      );
      throw err;
    } finally {
      conn.release();
    }
  }

  async getAllCategories() {
    const [rows] = await this._db.execute(`SELECT * FROM schedule_categories`);
    return rows;
  }

  async getCategoryById(id) {
    const [rows] = await this._db.execute(
      `SELECT * FROM schedule_categories WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) throw new Error("Kategori tidak ditemukan");
    return rows[0];
  }

  async updateCategory(id, { name, description, time_start, time_end }) {
    const [result] = await this._db.execute(
      `UPDATE schedule_categories SET name = ?, description = ?, time_start = ?, time_end = ? WHERE id = ?`,
      [name, description, time_start, time_end, id]
    );

    if (result.affectedRows === 0) {
      throw new InvariantError(
        "Gagal memperbarui kategori. ID tidak ditemukan."
      );
    }
  }

  async deleteCategory(id) {
    const [result] = await this._db.execute(
      `DELETE FROM schedule_categories WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      throw new InvariantError("Gagal menghapus kategori. ID tidak ditemukan.");
    }
  }

  async getUserSchedules(user_id, month) {
    console.log(`userId ${user_id} month ${month}`);

    let query = `
      SELECT us.*, sc.name AS category_name, sc.time_start, sc.time_end
      FROM user_schedules us
      JOIN schedule_categories sc ON sc.id = us.category_id
      WHERE DATE_FORMAT(us.date, '%Y-%m') = ?
    `;
    let params = [month];

    if (user_id) {
      query += ` AND us.user_id = ?`;
      params.push(user_id);
    }

    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  async deleteUserSchedule(user_id, date) {
    const [result] = await this._db.execute(
      `DELETE FROM user_schedules WHERE user_id = ? AND date = ?`,
      [user_id, date]
    );

    if (result.affectedRows === 0) {
      throw new InvariantError("Gagal menghapus jadwal. Data tidak ditemukan.");
    }
  }

  async getUserIdByUsername(username) {
    const [rows] = await this._db.execute(
      `SELECT id FROM users WHERE username = ?`,
      [username]
    );
    if (rows.length === 0) {
      throw new InvariantError(`User not found for username: ${username}`);
    }
    return rows[0].id;
  }

  async upsertUserSchedule({ user_id, date, category_id }) {
    // Validate category exists
    const [cat] = await this._db.execute(
      `SELECT id FROM schedule_categories WHERE id = ?`,
      [category_id]
    );
    if (cat.length === 0) {
      throw new InvariantError("Kategori tidak ditemukan.");
    }

    // Update if exists, else insert
    const [existing] = await this._db.execute(
      `SELECT id FROM user_schedules WHERE user_id = ? AND date = ?`,
      [user_id, date]
    );

    if (existing.length > 0) {
      await this._db.execute(
        `UPDATE user_schedules SET category_id = ? WHERE id = ?`,
        [category_id, existing[0].id]
      );
      return { id: existing[0].id, action: "updated" };
    }

    const id = nanoid(16);
    await this._db.execute(
      `INSERT INTO user_schedules (id, user_id, date, category_id) VALUES (?, ?, ?, ?)`,
      [id, user_id, date, category_id]
    );
    return { id, action: "created" };
  }

  /**
   * Dapatkan jadwal untuk satu user pada satu tanggal (YYYY-MM-DD).
   * Prioritas:
   *  1) Cek user_schedules (kategori per-tanggal)
   *  2) Jika tidak ada, fallback ke work_schedules (jadwal default)
   *  3) Jika tidak ada keduanya, return minimal info dengan null times
   */
  async getScheduleForDate(user_id, date) {
    // 1) user_schedules (per-date assignment)
    const [rows] = await this._db.execute(
      `SELECT 
        us.date,
        us.user_id,
        us.category_id,
        sc.name AS category_name,
        DATE_FORMAT(sc.time_start, '%H:%i') AS expected_checkin,
        DATE_FORMAT(sc.time_end,   '%H:%i') AS expected_checkout
     FROM user_schedules us
     JOIN schedule_categories sc ON sc.id = us.category_id
     WHERE us.user_id = ? AND us.date = ?
     LIMIT 1`,
      [user_id, date]
    );

    if (rows.length) {
      const r = rows[0];
      return {
        source: "user_schedules",
        date: r.date,
        user_id: r.user_id,
        category_id: r.category_id,
        category_name: r.category_name, // <-- FE reads this
        expected_checkin: r.expected_checkin, // "HH:mm"
        expected_checkout: r.expected_checkout, // "HH:mm"
      };
    }

    // 2) default (work_schedules)
    const [def] = await this._db.execute(
      `SELECT 
        DATE_FORMAT(expected_checkin, '%H:%i') AS expected_checkin,
        DATE_FORMAT(expected_checkout, '%H:%i') AS expected_checkout
     FROM work_schedules
     WHERE user_id = ?
     LIMIT 1`,
      [user_id]
    );

    if (def.length) {
      return {
        source: "default_schedule",
        date,
        user_id,
        category_id: null,
        category_name: "Default", // <-- FE reads this
        expected_checkin: def[0].expected_checkin,
        expected_checkout: def[0].expected_checkout,
      };
    }

    // 3) none
    return {
      source: "none",
      date,
      user_id,
      category_id: null,
      category_name: null, // or '-' if you prefer
      expected_checkin: null,
      expected_checkout: null,
    };
  }
}

module.exports = WorkScheduleService;
