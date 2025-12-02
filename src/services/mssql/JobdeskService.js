const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class JobdeskService {
  constructor() {
    this._db = database.getConnection();
  }

  async addJobdesk(ownerId, unitId, divisionId, title, description, filePath) {
    try {
      const id = nanoid(16);
      const query = "INSERT INTO jobdesks VALUES(?, ?, ?, ?, ?, ?, ?)";
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
        throw new InvariantError("Jobdesk berhasil ditambahkan.");
      }
      return id;
    } catch (error) {
      console.error(error);
    }
  }

  async getJobdeskById(jobdeskId) {
    const query = "SELECT id FROM jobdesks WHERE id =?";
    const [rows] = await this._db.execute(query, [jobdeskId]);
    if (rows.length === 0) {
      throw new InvariantError("Jobdesk tidak ditemukan.");
    }
  }

  async getUserIsJobdeskOwner(jobdeskId, ownerId) {
    const query = "SELECT id FROM jobdesks WHERE id =? and ownerId = ?";
    const [rows] = await this._db.execute(query, [jobdeskId, ownerId]);
    if (rows.length === 0) {
      throw new InvariantError("Anda Bukan Owner.");
    }
  }

  async getJobdesks(divisionId, unitId, userId) {
    try {
      const results = new Set(); // Menggunakan Set untuk menghindari duplikasi
      // Query berdasarkan unitId jika tidak kosong
      if (unitId) {
        const unitQuery = `
          SELECT DISTINCT
            jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath, jd.is_public
          FROM 
            jobdesks AS jd 
          LEFT JOIN 
            jobdesksaccesscollab AS jac 
          ON 
            jd.id = jac.jobdeskId 
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
            jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath, jd.is_public
          FROM 
            jobdesks AS jd 
          LEFT JOIN 
            jobdesksaccesscollab AS jac 
          ON 
            jd.id = jac.jobdeskId 
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
          jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath, jd.is_public
        FROM 
          jobdesks AS jd 
        LEFT JOIN 
          jobdesksaccesscollab AS jac 
        ON 
          jd.id = jac.jobdeskId 
        WHERE 
          jac.userId = ?
      `;
      const [userRows] = await this._db.execute(userQuery, [userId]);
      userRows.forEach((row) => results.add(JSON.stringify(row)));

      // New query to get jobdesks where is_public is true
      const publicQuery = `
        SELECT DISTINCT
          jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath, jd.is_public
        FROM 
          jobdesks AS jd
        WHERE 
          jd.is_public = true`;
      const [publicRows] = await this._db.execute(publicQuery);
      publicRows.forEach((row) => results.add(JSON.stringify(row)));

      // Menggabungkan hasil dan menghapus duplikasi
      const finalResults = Array.from(results).map((row) => JSON.parse(row));
      return finalResults;
    } catch (error) {
      console.error(error);
    }
  }
}

module.exports = JobdeskService;
