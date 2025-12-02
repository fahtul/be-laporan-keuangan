const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class KpiService {
  constructor() {
    this._db = database.getConnection();
  }

  async addKpiCollaborationByDivision(kpiId, divisionId) {
    const id = nanoid(16);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const query =
      "INSERT INTO kpisaccesscollab(id, kpiId, divisionId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
    const values = [id, kpiId, divisionId, createdAt, updatedAt];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError(
        "Kpi Collaboration Divisi berhasil ditambahkan."
      );
    }
    return id;
  }

  async addKpiCollaborationByUnit(kpiId, unitId) {
    const id = nanoid(16);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const query =
      "INSERT INTO kpisaccesscollab(id, kpiId, unitId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
    const values = [id, kpiId, unitId, createdAt, updatedAt];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError(
        "Kpi Collaboration Unit berhasil ditambahkan."
      );
    }
    return id;
  }
  async addKpiCollaborationByUser(kpiId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const queries = userIds.map((userId) => {
      const id = nanoid(16);
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      const query =
        "INSERT INTO kpisaccesscollab(id, kpiId, userId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
      const values = [id, kpiId, userId, createdAt, updatedAt];
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
        "Some Kpi Collaboration User failed to be added."
      );
    }

    return queries.map((query) => query.id); // Return array of IDs
  }
  async checkKpiIdWithDivisionIsNotExists(kpiId, divisionId) {
    const query =
      "SELECT id FROM kpisaccesscollab WHERE kpiId =? and divisionId =?";
    const [rows] = await this._db.execute(query, [kpiId, divisionId]);
    if (rows.length !== 0) {
      const divisionQuery = "SELECT name FROM divisions WHERE id = ?";
      const [divisionRows] = await this._db.execute(divisionQuery, [
        divisionId,
      ]);
      const divisionName = divisionRows[0].name;
      throw new InvariantError(
        `Akses Kpi Untuk ${divisionName} sudah ada.`
      );
    }
  }

  async checkUnitIdIsNotExists(kpiId, unitId) {
    const query =
      "SELECT id FROM kpisaccesscollab WHERE unitId =? and kpiId =?";
    const [rows] = await this._db.execute(query, [unitId, kpiId]);
    if (rows.length !== 0) {
      const unitQuery = "SELECT name FROM units WHERE id = ?";
      const [unitRows] = await this._db.execute(unitQuery, [unitId]);
      const unitName = unitRows[0].name;
      throw new InvariantError(`Akses Kpi Untuk ${unitName} sudah ada.`);
    }
  }

  async checkUserIdIsNotExists(kpiId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const existingUsers = [];

    const promises = userIds.map(async (userId) => {
      const checkQuery =
        "SELECT id FROM kpisaccesscollab WHERE kpiId = ? AND userId = ?";
      const [checkRows] = await this._db.execute(checkQuery, [
        kpiId,
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
        `Kpi Collaboration Users ${existingUsers.join(", ")} already exist.`
      );
    }
  }
}

module.exports = KpiService;
