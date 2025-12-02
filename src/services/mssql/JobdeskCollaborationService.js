const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class JobdeskService {
  constructor() {
    this._db = database.getConnection();
  }

  async addJobdeskCollaborationByDivision(jobdeskId, divisionId) {
    const id = nanoid(16);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const query =
      "INSERT INTO jobdesksaccesscollab(id, jobdeskId, divisionId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
    const values = [id, jobdeskId, divisionId, createdAt, updatedAt];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError(
        "Jobdesk Collaboration Divisi berhasil ditambahkan."
      );
    }
    return id;
  }

  async addJobdeskCollaborationByUnit(jobdeskId, unitId) {
    const id = nanoid(16);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const query =
      "INSERT INTO jobdesksaccesscollab(id, jobdeskId, unitId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
    const values = [id, jobdeskId, unitId, createdAt, updatedAt];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError(
        "Jobdesk Collaboration Unit berhasil ditambahkan."
      );
    }
    return id;
  }
  async addJobdeskCollaborationByUser(jobdeskId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const queries = userIds.map((userId) => {
      const id = nanoid(16);
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;

      const query =
        "INSERT INTO jobdesksaccesscollab(id, jobdeskId, userId, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?)";
      const values = [id, jobdeskId, userId, createdAt, updatedAt];
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
        "Some Jobdesk Collaboration User failed to be added."
      );
    }

    return queries.map((query) => query.id); // Return array of IDs
  }
  async checkJobdeskIdWithDivisionIsNotExists(jobdeskId, divisionId) {
    const query =
      "SELECT id FROM jobdesksaccesscollab WHERE jobdeskId =? and divisionId =?";
    const [rows] = await this._db.execute(query, [jobdeskId, divisionId]);
    if (rows.length !== 0) {
      const divisionQuery = "SELECT name FROM divisions WHERE id = ?";
      const [divisionRows] = await this._db.execute(divisionQuery, [
        divisionId,
      ]);
      const divisionName = divisionRows[0].name;
      throw new InvariantError(
        `Akses Jobdesk Untuk ${divisionName} sudah ada.`
      );
    }
  }

  async checkUnitIdIsNotExists(jobdeskId, unitId) {
    const query =
      "SELECT id FROM jobdesksaccesscollab WHERE unitId =? and jobdeskId =?";
    const [rows] = await this._db.execute(query, [unitId, jobdeskId]);
    if (rows.length !== 0) {
      const unitQuery = "SELECT name FROM units WHERE id = ?";
      const [unitRows] = await this._db.execute(unitQuery, [unitId]);
      const unitName = unitRows[0].name;
      throw new InvariantError(`Akses Jobdesk Untuk ${unitName} sudah ada.`);
    }
  }

  async checkUserIdIsNotExists(jobdeskId, userIds) {
    if (!Array.isArray(userIds)) {
      throw new InvariantError("userIds must be an array");
    }

    const existingUsers = [];

    const promises = userIds.map(async (userId) => {
      const checkQuery =
        "SELECT id FROM jobdesksaccesscollab WHERE jobdeskId = ? AND userId = ?";
      const [checkRows] = await this._db.execute(checkQuery, [
        jobdeskId,
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
        `Jobdesk Collaboration Users ${existingUsers.join(", ")} already exist.`
      );
    }
  }
}

module.exports = JobdeskService;
