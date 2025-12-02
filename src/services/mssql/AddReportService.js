const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class AddReportService {
  constructor() {
    this._db = database.getConnection();
  }

  async addReport(ownerId, title, description, divisionId, unitId, fileName) {
    try {
      const id = nanoid(16);
      const query = `
      INSERT INTO inputreports (
        id, owner_id, title, description,
        division_id, unit_id, photo_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

      const values = [
        id,
        ownerId,
        title,
        description || null,
        divisionId !== undefined && divisionId !== "" ? divisionId : null,
        unitId !== undefined && unitId !== "" ? unitId : null,
        fileName !== undefined && fileName !== "" ? fileName : null,
      ];

      console.log(`Executing query: ${query}`);
      console.log(`With values: ${values}`);

      const [result] = await this._db.execute(query, values);

      if (result.affectedRows !== 1) {
        throw new InvariantError("Report gagal ditambahkan.");
      }
      return id;
    } catch (error) {
      console.error("Error adding report:", error);
      throw new InvariantError("Error adding report.");
    }
  }

  async getReportById(reportId) {
    console.log(`service Fetching report with ID: ${reportId}`);
    const query = `
      SELECT *
      FROM inputreports
      WHERE id = ?
    `;
    const [rows] = await this._db.execute(query, [reportId]);
    if (rows.length === 0) {
      throw new InvariantError("Report tidak ditemukan.");
    }
    return rows[0];
  }

  async getReportsCount(filters) {
    try {
      let query = "SELECT COUNT(*) as total FROM inputreports WHERE 1=1";
      const params = [];

      // 🔎 Filter baru: title (LIKE)
      if (filters.title) {
        query += " AND title LIKE ?";
        params.push(`%${filters.title}%`);
      }

      // 🔎 Filter tanggal berdasarkan created_at (laporan harian)
      if (filters.startDate) {
        query += " AND DATE(created_at) >= ?";
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        query += " AND DATE(created_at) <= ?";
        params.push(filters.endDate);
      }

      // Filter role-based yang sudah ada
      if (filters.division_id) {
        query += " AND division_id = ?";
        params.push(filters.division_id);
      }
      if (filters.unit_id) {
        query += " AND unit_id = ?";
        params.push(filters.unit_id);
      }
      if (filters.owner_id) {
        query += " AND owner_id = ?";
        params.push(filters.owner_id);
      }

      const [result] = await this._db.execute(query, params);
      return parseInt(result[0].total, 10);
    } catch (error) {
      console.error("Error counting reports:", error);
      throw new InvariantError("Failed to count reports.");
    }
  }

  async getReports(filters) {
    try {
      let query = `
      SELECT 
        inputreports.*, 
        users.fullname AS owner_name 
      FROM inputreports
      JOIN users ON inputreports.owner_id = users.id
      WHERE 1=1
    `;

      const params = [];

      // 🔎 Filter baru: title (LIKE)
      if (filters.title) {
        query += " AND inputreports.title LIKE ?";
        params.push(`%${filters.title}%`);
      }

      // 🔎 Filter tanggal berdasarkan created_at (laporan harian)
      if (filters.startDate) {
        query += " AND DATE(inputreports.created_at) >= ?";
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        query += " AND DATE(inputreports.created_at) <= ?";
        params.push(filters.endDate);
      }

      // Filter role-based
      if (filters.division_id) {
        query += " AND inputreports.division_id = ?";
        params.push(filters.division_id);
      }
      if (filters.unit_id) {
        query += " AND inputreports.unit_id = ?";
        params.push(filters.unit_id);
      }
      if (filters.owner_id) {
        query += " AND inputreports.owner_id = ?";
        params.push(filters.owner_id);
      }

      query += " ORDER BY inputreports.created_at DESC";

      // LIMIT & OFFSET aman
      const maxLimit = 100;
      const safeLimit = Number.isInteger(filters.limit)
        ? Math.min(filters.limit, maxLimit)
        : null;
      const safeOffset = Number.isInteger(filters.offset)
        ? Math.max(filters.offset, 0)
        : null;

      if (safeLimit !== null) {
        query += ` LIMIT ${safeLimit}`;
      }

      if (safeOffset !== null) {
        query += ` OFFSET ${safeOffset}`;
      }

      console.log(`Executing query: ${query}`);
      console.log(`With params: ${params}`);

      const [rows] = await this._db.execute(query, params);
      return rows;
    } catch (error) {
      console.error("Error fetching reports:", error);
      throw new InvariantError("Failed to fetch reports.");
    }
  }

  async getUserIsReportOwner(reportId, ownerId) {
    const query = `
      SELECT id
      FROM reports
      WHERE id = ? AND owner_id = ?
    `;
    const [rows] = await this._db.execute(query, [reportId, ownerId]);
    if (rows.length === 0) {
      throw new InvariantError("Anda bukan pemilik laporan ini.");
    }
  }

  async deleteReport(reportId) {
    const deleteSql = `DELETE FROM inputreports WHERE id = ?`;
    const [result] = await this._db.execute(deleteSql, [reportId]);
    console.log(`Executing delete query: ${deleteSql}`);
    console.log(`With reportId: ${reportId}`);
    if (result.affectedRows === 0) {
      throw new InvariantError("Laporan tidak ditemukan atau sudah dihapus");
    }
  }
}

module.exports = AddReportService;
