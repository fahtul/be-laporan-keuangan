const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class NilaiService {
  constructor() {
    this._db = database.getConnection();
  }

  async addNilaiCollaborationByDivision(nilaiId, divisionId) {
    const id = nanoid(16);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const query =
      "INSERT INTO nilaisaccesscollab(id, nilaiId, divisionId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
    const values = [id, nilaiId, divisionId, createdAt, updatedAt];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError(
        "Nilai Collaboration Divisi berhasil ditambahkan."
      );
    }
    return id;
  }

  async addNilaiCollaborationByUnit(nilaiId, unitId) {
    const id = nanoid(16);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const query =
      "INSERT INTO nilaisaccesscollab(id, nilaiId, unitId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
    const values = [id, nilaiId, unitId, createdAt, updatedAt];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError(
        "Nilai Collaboration Unit berhasil ditambahkan."
      );
    }
    return id;
  }
  async addNilaiCollaborationByUser(nilaiId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const queries = userIds.map((userId) => {
      const id = nanoid(16);
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      const query =
        "INSERT INTO nilaisaccesscollab(id, nilaiId, userId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
      const values = [id, nilaiId, userId, createdAt, updatedAt];
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
        "Some Nilai Collaboration User failed to be added."
      );
    }

    return queries.map((query) => query.id); // Return array of IDs
  }
  async checkNilaiIdWithDivisionIsNotExists(nilaiId, divisionId) {
    const query =
      "SELECT id FROM nilaisaccesscollab WHERE nilaiId =? and divisionId =?";
    const [rows] = await this._db.execute(query, [nilaiId, divisionId]);
    if (rows.length !== 0) {
      const divisionQuery = "SELECT name FROM divisions WHERE id = ?";
      const [divisionRows] = await this._db.execute(divisionQuery, [
        divisionId,
      ]);
      const divisionName = divisionRows[0].name;
      throw new InvariantError(
        `Akses Nilai Untuk ${divisionName} sudah ada.`
      );
    }
  }

  async checkUnitIdIsNotExists(nilaiId, unitId) {
    const query =
      "SELECT id FROM nilaisaccesscollab WHERE unitId =? and nilaiId =?";
    const [rows] = await this._db.execute(query, [unitId, nilaiId]);
    if (rows.length !== 0) {
      const unitQuery = "SELECT name FROM units WHERE id = ?";
      const [unitRows] = await this._db.execute(unitQuery, [unitId]);
      const unitName = unitRows[0].name;
      throw new InvariantError(`Akses Nilai Untuk ${unitName} sudah ada.`);
    }
  }

  async checkUserIdIsNotExists(nilaiId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const existingUsers = [];

    const promises = userIds.map(async (userId) => {
      const checkQuery =
        "SELECT id FROM nilaisaccesscollab WHERE nilaiId = ? AND userId = ?";
      const [checkRows] = await this._db.execute(checkQuery, [
        nilaiId,
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
        `Nilai Collaboration Users ${existingUsers.join(", ")} already exist.`
      );
    }
  }
}

module.exports = NilaiService;
