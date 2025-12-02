const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class KpiService {
  constructor() {
    this._db = database.getConnection();
  }

  async addKpi(ownerId, unitId, divisionId, title, description, filePath) {
    try {
      const id = nanoid(16);
      const query = "INSERT INTO kpis VALUES(?, ?, ?, ?, ?, ?, ?)";
      const values = [
        id,
        ownerId,
        unitId,
        divisionId,
        title,
        description,
        filePath,
      ];
      const [result] = await this._db.execute(query, values);

      if (result.affectedRows !== 1) {
        throw new InvariantError("Kpi berhasil ditambahkan.");
      }
      return id;
    } catch (error) {
      console.error(error);
    }
  }

  async getKpiById(kpiId) {
    const query = "SELECT id FROM kpis WHERE id =?";
    const [rows] = await this._db.execute(query, [kpiId]);
    if (rows.length === 0) {
      throw new InvariantError("Kpi tidak ditemukan.");
    }
  }

  async getUserIsKpiOwner(kpiId, ownerId) {
    const query = "SELECT id FROM kpis WHERE id =? and ownerId = ?";
    const [rows] = await this._db.execute(query, [kpiId, ownerId]);
    if (rows.length === 0) {
      throw new InvariantError("Anda Bukan Owner.");
    }
  }

  async getKpis(divisionId, unitId, userId) {
    try {
      const results = new Set(); // Menggunakan Set untuk menghindari duplikasi
      // Query berdasarkan unitId jika tidak kosong
      if (unitId) {
        const unitQuery = `
          SELECT DISTINCT
            jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath
          FROM 
            kpis AS jd 
          LEFT JOIN 
            kpisaccesscollab AS jac 
          ON 
            jd.id = jac.kpiId 
          WHERE 
            jac.unitId = ?
        `;
        const [unitRows] = await this._db.execute(unitQuery, [unitId]);
        unitRows.forEach((row) => results.add(JSON.stringify(row)));
      }

      // Query berdasarkan divisionId jika tidak kosong
      if (divisionId) {
        const divisionQuery = `
          SELECT DISTINCT
            jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath
          FROM 
            kpis AS jd 
          LEFT JOIN 
            kpisaccesscollab AS jac 
          ON 
            jd.id = jac.kpiId 
          WHERE 
            jac.divisionId = ?
        `;
        const [divisionRows] = await this._db.execute(divisionQuery, [
          divisionId,
        ]);
        divisionRows.forEach((row) => results.add(JSON.stringify(row)));
      }

      // Query berdasarkan userId
      const userQuery = `
        SELECT DISTINCT
          jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath
        FROM 
          kpis AS jd 
        LEFT JOIN 
          kpisaccesscollab AS jac 
        ON 
          jd.id = jac.kpiId 
        WHERE 
          jac.userId = ?
      `;
      const [userRows] = await this._db.execute(userQuery, [userId]);
      userRows.forEach((row) => results.add(JSON.stringify(row)));

      // Menggabungkan hasil dan menghapus duplikasi
      const finalResults = Array.from(results).map((row) => JSON.parse(row));
      return finalResults;
    } catch (error) {
      console.error(error);
    }
  }
}

module.exports = KpiService;
