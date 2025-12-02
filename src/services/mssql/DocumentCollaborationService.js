const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class DocumentService {
  constructor() {
    this._db = database.getConnection();
  }

  async addDocumentCollaborationByDivision(documentId, divisionIds) {
    if (!Array.isArray(divisionIds)) {
      throw new InvariantError("divisionIds must be an array");
    }

    const queries = divisionIds.map((divisionId) => {
      const id = nanoid(16);
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      const query =
        "INSERT INTO documentsaccesscollab(id, documentId, divisionId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
      const values = [id, documentId, divisionId, createdAt, updatedAt];
      return { query, values, id };
    });

    const promises = queries.map(({ query, values }) =>
      this._db.execute(query, values)
    );
    const results = await Promise.all(promises);

    const allSuccessful = results.every(
      ([result]) => result.affectedRows === 1
    );

    if (!allSuccessful) {
      throw new InvariantError(
        "Some Document Collaboration Division failed to be added."
      );
    }

    return queries.map((query) => query.id); // Return array of inserted IDs
  }

  async addDocumentCollaborationByUnit(documentId, unitIds) {
    if (!Array.isArray(unitIds)) {
      throw new InvariantError("unitIds must be an array");
    }

    const queries = unitIds.map((unitId) => {
      const id = nanoid(16);
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      const query =
        "INSERT INTO documentsaccesscollab(id, documentId, unitId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
      const values = [id, documentId, unitId, createdAt, updatedAt];
      return { query, values, id };
    });

    const promises = queries.map(({ query, values }) =>
      this._db.execute(query, values)
    );
    const results = await Promise.all(promises);

    const allSuccessful = results.every(
      ([result]) => result.affectedRows === 1
    );

    if (!allSuccessful) {
      throw new InvariantError(
        "Some Document Collaboration Unit failed to be added."
      );
    }

    return queries.map((query) => query.id); // Return array of inserted IDs
  }
  async addDocumentCollaborationByUser(documentId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const queries = userIds.map((userId) => {
      const id = nanoid(16);
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      const query =
        "INSERT INTO documentsaccesscollab(id, documentId, userId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
      const values = [id, documentId, userId, createdAt, updatedAt];
      return { query, values, id };
    });

    const promises = queries.map(({ query, values }) =>
      this._db.execute(query, values)
    );
    const results = await Promise.all(promises);

    const allSuccessful = results.every(
      ([result]) => result.affectedRows === 1
    );

    if (!allSuccessful) {
      throw new InvariantError(
        "Some Document Collaboration User failed to be added."
      );
    }

    return queries.map((query) => query.id); // Return array of IDs
  }
  async checkDocumentIdWithDivisionIsNotExists(documentId, divisionId) {
    const query =
      "SELECT id FROM documentsaccesscollab WHERE documentId =? and divisionId =?";
    const [rows] = await this._db.execute(query, [documentId, divisionId]);
    if (rows.length !== 0) {
      const divisionQuery = "SELECT name FROM divisions WHERE id = ?";
      const [divisionRows] = await this._db.execute(divisionQuery, [
        divisionId,
      ]);
      const divisionName = divisionRows[0].name;
      throw new InvariantError(
        `Akses Document Untuk ${divisionName} sudah ada.`
      );
    }
  }

  async checkUnitIdIsNotExists(documentId, unitId) {
    const query =
      "SELECT id FROM documentsaccesscollab WHERE unitId =? and documentId =?";
    const [rows] = await this._db.execute(query, [unitId, documentId]);
    if (rows.length !== 0) {
      const unitQuery = "SELECT name FROM units WHERE id = ?";
      const [unitRows] = await this._db.execute(unitQuery, [unitId]);
      const unitName = unitRows[0].name;
      throw new InvariantError(`Akses Document Untuk ${unitName} sudah ada.`);
    }
  }

  async checkUserIdIsNotExists(documentId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const existingUsers = [];

    const promises = userIds.map(async (userId) => {
      const checkQuery =
        "SELECT id FROM documentsaccesscollab WHERE documentId = ? AND userId = ?";
      const [checkRows] = await this._db.execute(checkQuery, [
        documentId,
        userId,
      ]);

      if (checkRows.length > 0) {
        const userQuery = "SELECT fullname FROM users WHERE id = ?";
        const [userRows] = await this._db.execute(userQuery, [userId]);

        if (userRows.length === 0) {
          throw new InvariantError(`User with ID ${userId} not found.`);
        }

        const userName = userRows[0].fullname;
        existingUsers.push(userName);
      }
    });

    await Promise.all(promises);

    if (existingUsers.length > 0) {
      throw new InvariantError(
        `Document Collaboration Users ${existingUsers.join(
          ", "
        )} already exist.`
      );
    }
  }
}

module.exports = DocumentService;
