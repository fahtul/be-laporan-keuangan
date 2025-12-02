const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");
const { getCurrentTimeInMakassar } = require("../../utils/utils");

class ReportService {
  constructor() {
    this._db = database.getConnection();
  }

  async addReport(
    ownerId,
    ownerFullname,
    picUserId,
    picFullname,
    roleId,
    unitId,
    divisionId,
    finding,
    discoveryDate,
    cause,
    recommendation,
    targetDate,
    imageUrl,
    progress
  ) {
    try {
      const id = nanoid(16);
      const query = `
        INSERT INTO reports (
          id, owner_id, ownerFullname, pic_user_id,picFullname, role_id, unit_id,
          division_id, finding, discovery_date, cause,
          recommendation, target_date, image_url,
          progress
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
      `;
      const values = [
        id,
        ownerId,
        ownerFullname,
        picUserId,
        picFullname,
        roleId,
        unitId,
        divisionId,
        finding,
        discoveryDate,
        cause,
        recommendation,
        targetDate,
        imageUrl,
        progress,
      ];

      const [result] = await this._db.execute(query, values);

      // console.log(
      //   `query: ${JSON.stringify(query)} and values: ${JSON.stringify(values)}`
      // );
      if (result.affectedRows !== 1) {
        throw new InvariantError("Gagal menambahkan laporan.");
      }
      return id;
    } catch (error) {
      console.error(error);
    }
  }

  async getReportsByRole(roleId, userId, unitId = null, divisionId = null) {
    let query = `
      SELECT *,
        CASE
          WHEN pic_user_id = ? THEN true
          ELSE false
        END AS is_pic
      FROM reports
      WHERE pic_user_id = ? OR owner_id = ?
    `;
    let params = [userId, userId, userId];

    if (roleId === 1) {
      // Director sees all reports
      query = `
        SELECT *,
          CASE
            WHEN pic_user_id = ? THEN true
            ELSE false
          END AS is_pic
        FROM reports
      `;
      params = [userId]; // Only need the userId for the CASE statement
    } else if (roleId === 2) {
      // Division Leader
      query += " OR division_id = ?";
      params.push(divisionId);
    } else if (roleId === 3) {
      // Unit Leader
      query += " OR unit_id = ?";
      params.push(unitId);
    }

    console.log(
      `role_id: ${roleId}, unit_id: ${unitId}, division_id: ${divisionId}, userId: ${userId}`
    );
    // console.log(`query: ${query}, params: ${JSON.stringify(params)}`);

    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  async getReportById(reportId) {
    const query =
      "SELECT id, owner_id, pic_user_id,unit_id, division_id, finding FROM reports WHERE id = ?";

    const result = await this._db.execute(query, [reportId]);
    return result[0];
  }

  async updateReport(roleId, reportId, note, leaderId) {
    let query;
    let noteField, updatedAtField, leaderIdField;
    let progressLevel;

    // Set fields based on the role
    switch (roleId) {
      case 3: // Unit Leader
        noteField = "unit_note";
        updatedAtField = "unit_updated_at";
        leaderIdField = "unit_leader_id";
        progressLevel = 1;
        break;
      case 2: // Division Leader
        noteField = "division_note";
        updatedAtField = "division_updated_at";
        leaderIdField = "division_leader_id";
        progressLevel = 2;
        break;
      case 1: // Director
        noteField = "director_note";
        updatedAtField = "director_updated_at";
        leaderIdField = "director_id";
        progressLevel = 3;
        break;
      default:
        throw new InvariantError("Invalid role ID");
    }
    // Get the current time in the correct timezone
    const currentTime = getCurrentTimeInMakassar();

    // Construct the SQL update query
    query = `
        UPDATE reports
        SET ${noteField} = ?,
            ${updatedAtField} = ?,
            ${leaderIdField} = ?,
            progress = ?
        WHERE id = ?;
    `;

    const values = [note, currentTime, leaderId, progressLevel, reportId];

    // console.log(`query: ${query} values: ${values}`);
    // Execute the update query
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Report update failed or no changes were made");
    }

    return { message: "Report updated successfully" };
  }

  async updatePICProgressReport(userId, reportId, note, imageUrl) {
    // Construct the SQL update query
    const isPic = await this.isPIC(userId, reportId);
    if (!isPic) {
      throw new InvariantError("Anda Bukan PIC");
    }
    const currentTime = getCurrentTimeInMakassar();
    const query = `
        UPDATE reports
        SET pic_progress_note = ?,
            pic_progress_updated_at = ?,
            pic_progress_photo_url = ?,
            progress = ?
        WHERE id = ?;
    `;

    const values = [note, currentTime, imageUrl, 4, reportId];

    // console.log(`query: ${query} values: ${values}`);
    // Execute the update query
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Report update failed or no changes were made");
    }

    return { message: "Report PIC Progress updated successfully" };
  }

  async updatePICDoneReport(userId, reportId, note, imageUrl) {
    // Construct the SQL update query
    const isPic = await this.isPIC(userId, reportId);
    if (!isPic) {
      throw new InvariantError("Anda Bukan PIC");
    }
    const currentTime = getCurrentTimeInMakassar();
    const query = `
        UPDATE reports
        SET pic_done_note = ?,
            pic_done_updated_at = ?,
            pic_done_photo_url = ?,
            progress = ?
        WHERE id = ?;
    `;

    const values = [note, currentTime, imageUrl, 5, reportId];

    // console.log(`query: ${query} values: ${values}`);
    // Execute the update query
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Report update failed or no changes were made");
    }

    return { message: "Report PIC Done updated successfully" };
  }

  async isPIC(userId, reportId) {
    // Construct the SQL query to check if the user is the PIC of the report
    const query = `
      SELECT COUNT(*) as count
      FROM reports
      WHERE id = ? AND pic_user_id = ?;
    `;

    const values = [reportId, userId];

    // Execute the query
    const [rows] = await this._db.execute(query, values);

    // Check if any records match
    if (rows[0].count > 0) {
      return true; // The user is the PIC for the report
    } else {
      return false; // The user is not the PIC for the report
    }
  }
}

module.exports = ReportService;
