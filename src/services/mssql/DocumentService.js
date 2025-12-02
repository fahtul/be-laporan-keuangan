const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class DocumentService {
  constructor() {
    this._db = database.getConnection();
  }

  async addDocument(
    ownerId,
    unitId,
    divisionId,
    title,
    description,
    filePath,
    isPublic
  ) {
    try {
      const id = nanoid(16);

      const query = "INSERT INTO documents VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
      const values = [
        id,
        ownerId,
        unitId,
        divisionId,
        title,
        description,
        filePath,
        isPublic,
      ];
      console.log(`Executing query: ${query}`);
      console.log(`With values: ${values}`);
      const [result] = await this._db.execute(query, values);

      if (result.affectedRows !== 1) {
        throw new InvariantError("Document berhasil ditambahkan.");
      }
      return id;
    } catch (error) {
      console.error(error);
    }
  }

  async getDocumentById(documentId) {
    const query = "SELECT id FROM documents WHERE id =?";
    const [rows] = await this._db.execute(query, [documentId]);
    if (rows.length === 0) {
      throw new InvariantError("Document tidak ditemukan.");
    }
  }

  async getUserIsDocumentOwner(documentId, ownerId) {
    const query = "SELECT id FROM documents WHERE id =? and ownerId = ?";
    const [rows] = await this._db.execute(query, [documentId, ownerId]);
    if (rows.length === 0) {
      throw new InvariantError("Anda Bukan Owner.");
    }
  }

  async getDocuments(divisionId, unitId, userId) {
    try {
      const results = new Set(); // Menggunakan Set untuk menghindari duplikasi
      // Query berdasarkan unitId jika tidak kosong
      if (unitId) {
        const unitQuery = `
          SELECT DISTINCT
            jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath, jd.is_public
          FROM 
            documents AS jd 
          LEFT JOIN 
            documentsaccesscollab AS jac 
          ON 
            jd.id = jac.documentId 
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
            documents AS jd 
          LEFT JOIN 
            documentsaccesscollab AS jac 
          ON 
            jd.id = jac.documentId 
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
          documents AS jd 
        LEFT JOIN 
          documentsaccesscollab AS jac 
        ON 
          jd.id = jac.documentId 
        WHERE 
          jac.userId = ?
      `;
      const [userRows] = await this._db.execute(userQuery, [userId]);
      userRows.forEach((row) => results.add(JSON.stringify(row)));

      // New query to get documents where is_public is true
      const publicQuery = `
        SELECT DISTINCT
          jd.id, jd.unitId, jd.divisionId, jd.title, jd.description, jd.filePath, jd.is_public
        FROM 
          documents AS jd
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

module.exports = DocumentService;
