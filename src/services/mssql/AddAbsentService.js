const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class AddAbsentService {
  constructor() {
    this._db = database.getConnection();
  }

  async addAbsent(
    ownerId,
    divisionName,
    position,
    activityType,
    description,
    durationHours,
    durationMinutes,
  ) {
    try {
      const id = nanoid(16);
      const query = `
        INSERT INTO input_absent (
          id, owner_id, division, position, activity_type,
          description, duration_hours, duration_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      const values = [
        id,
        ownerId,
        divisionName,
        position,
        activityType,
        description,
        durationHours,
        durationMinutes
      ];

      const [result] = await this._db.execute(query, values);

      if (result.affectedRows !== 1) {
        throw new InvariantError("Absent gagal ditambahkan.");
      }
      return id;
    } catch (error) {
      console.error("Error adding report:", error);
      throw new InvariantError("Error adding report.");
    }
  }

  async getAbsentById(reportId) {
    const query = `
      SELECT *
      FROM reports
      WHERE id = ?
    `;
    const [rows] = await this._db.execute(query, [reportId]);
    if (rows.length === 0) {
      throw new InvariantError("Absent tidak ditemukan.");
    }
    return rows[0];
  }

  // async getAbsents(filters) {
  //   try {
  //     let query = "SELECT * FROM inputreports WHERE 1=1";
  //     const params = [];

  //     // Dynamically add filters
  //     if (filters.year) {
  //       query += " AND year = ?";
  //       params.push(filters.year);
  //     }
  //     if (filters.month) {
  //       query += " AND month = ?";
  //       params.push(filters.month);
  //     }
  //     if (filters.reportType) {
  //       query += " AND report_type = ?";
  //       params.push(filters.reportType);
  //     }
  //     if (filters.committeeName) {
  //       query += " AND committee_name = ?";
  //       params.push(filters.committeeName);
  //     }
  //     if (filters.teamName) {
  //       query += " AND team_name = ?";
  //       params.push(filters.teamName);
  //     }
  //     if (filters.divisionName) {
  //       query += " AND division_name = ?";
  //       params.push(filters.divisionName);
  //     }
  //     if (filters.unitName) {
  //       query += " AND unit_name = ?";
  //       params.push(filters.unitName);
  //     }
  //     if (filters.specialAbsentName) {
  //       query += " AND special_report_name = ?";
  //       params.push(filters.specialAbsentName);
  //     }

  //     const [rows] = await this._db.execute(query, params);
  //     return rows;
  //   } catch (error) {
  //     console.error("Error fetching reports:", error);
  //     throw new InvariantError("Failed to fetch reports.");
  //   }
  // }

  // async getUserIsAbsentOwner(reportId, ownerId) {
  //   const query = `
  //     SELECT id
  //     FROM reports
  //     WHERE id = ? AND owner_id = ?
  //   `;
  //   const [rows] = await this._db.execute(query, [reportId, ownerId]);
  //   if (rows.length === 0) {
  //     throw new InvariantError("Anda bukan pemilik laporan ini.");
  //   }
  // }
}

module.exports = AddAbsentService;
