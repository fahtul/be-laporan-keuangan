const { nanoid } = require("nanoid");
const bcrypt = require("bcrypt");
const InvariantError = require("../../exceptions/InvariantError");
const AuthenticationError = require("../../exceptions/AuthenticationError");
const database = require("../../database");
const NotFoundError = require("../../exceptions/NotFoundError");
const ExcelJS = require("exceljs");

class UsersService {
  constructor() {
    this._db = database.getConnection();
  }

  async verifyNewUsername(username) {
    const query = "SELECT username FROM users WHERE username = ?";
    const values = [username];
    const [result] = await this._db.execute(query, values);
    if (result.length > 0) {
      throw new InvariantError(
        "Gagal menambahkan user. Username sudah digunakan."
      );
    }
  }

  async deleteUserById(userId, deletedId) {
    await this.getIsUserAdmin(userId);
    const query = "DELETE FROM users WHERE id = ?";
    const values = [deletedId];
    const [result] = await this._db.execute(query, values);
    if (result.affectedRows !== 1) {
      throw new NotFoundError("Gagal menghapus user, User Id Tidak ditemukan.");
    }
  }

  async getBasicSalary(userId) {
    const [rows] = await this._db.execute(
      `SELECT basic_salary FROM users WHERE id = ?`,
      [userId]
    );
    if (!rows.length) {
      throw new NotFoundError("User tidak ditemukan.");
    }
    return parseFloat(rows[0].basic_salary);
  }
  async addUser(
    userId,
    {
      username,
      fullname,
      password,
      divisionId,
      unitId,
      roleId,
      adminStatus,
      basicSalary = 0,
      hired_date,
    }
  ) {
    await this.getIsUserAdmin(userId);
    await this.verifyNewUsername(username);

    const id = `users-${nanoid(16)}`;
    const hashedPassword = await bcrypt.hash(password, 10);
    const queries = {
      1: "INSERT INTO users(id, username, fullname, password, role_id, admin_status, basic_salary, hired_date) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
      2: "INSERT INTO users(id, username, fullname, password, division_id, role_id, admin_status, basic_salary, hired_date) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      default:
        "INSERT INTO users(id, username, fullname, password, division_id, unit_id, role_id, admin_status, basic_salary, hired_date) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    };

    const values = {
      1: [
        id,
        username,
        fullname,
        hashedPassword,
        roleId,
        adminStatus,
        basicSalary,
        hired_date,
      ],
      2: [
        id,
        username,
        fullname,
        hashedPassword,
        divisionId,
        roleId,
        adminStatus,
        basicSalary,
        hired_date,
      ],
      default: [
        id,
        username,
        fullname,
        hashedPassword,
        divisionId,
        unitId,
        roleId,
        adminStatus,
        basicSalary,
        hired_date,
      ],
    };

    // Handle the default case properly
    const query = queries[roleId] || queries.default;
    const value = values[roleId] || values.default;

    const [result] = await this._db.execute(query, value);

    if (result.affectedRows !== 1) {
      throw new InvariantError("User gagal ditambahkan");
    }
  }

  async updateUser(
    userId,
    {
      id: updatedUserId,
      fullname,
      divisionId,
      unitId,
      roleId,
      adminStatus,
      basicSalary,
    }
  ) {
    await this.getIsUserAdmin(userId);

    const queries = {
      1: "UPDATE users SET fullname = ?, role_id = ?, admin_status = ?, division_id = ?, unit_id = ?, basic_salary = ? WHERE id = ?",
      2: "UPDATE users SET fullname = ?, division_id = ?, role_id = ?, admin_status = ?, unit_id = ?, basic_salary = ? WHERE id = ?",
      default:
        "UPDATE users SET fullname = ?, division_id = ?, unit_id = ?, role_id = ?, admin_status = ?, basic_salary = ? WHERE id = ?",
    };

    const values = {
      1: [
        fullname,
        roleId,
        adminStatus,
        null,
        null,
        basicSalary,
        updatedUserId,
      ],
      2: [
        fullname,
        divisionId,
        roleId,
        adminStatus,
        null,
        basicSalary,
        updatedUserId,
      ],
      default: [
        fullname,
        divisionId,
        unitId,
        roleId,
        adminStatus,
        basicSalary,
        updatedUserId,
      ],
    };

    // Handle the default case properly
    const query = queries[roleId] || queries.default;
    const value = values[roleId] || values.default;

    const [result] = await this._db.execute(query, value);

    if (result.affectedRows !== 1) {
      throw new InvariantError("User gagal diperbarui");
    }
  }

  async updatePassword(username, currentPassword, newPassword) {
    // Hash the new password
    const user = await this.verifyUserCredential(username, currentPassword);

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update the password in the database
    const updateQuery =
      "UPDATE users SET password = ?, is_changed_password=1 WHERE id = ?";
    const [result] = await this._db.execute(updateQuery, [
      hashedNewPassword,
      user.id,
    ]);

    if (result.affectedRows === 0) {
      throw new Error("Failed to update password");
    }

    // Invalidate the user's current session or token
    await this.invalidateUserSessions(user.id);

    return { message: "Password updated successfully" };
  }

  async invalidateUserSessions(token) {
    // Assuming you have a table named 'sessions' or 'tokens'
    const deleteQuery = "DELETE FROM authentications WHERE token = ?";
    await this._db.execute(deleteQuery, [token]);
  }

  async updateUserStatus(userId) {
    const queries = "UPDATE users SET is_changed_password = ? WHERE id = ?";

    const values = [1, userId];

    // Handle the default case properly
    const [result] = await this._db.execute(queries, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError("User gagal diperbarui");
    }
  }

  async getUserById(userId) {
    const query =
      "SELECT id, username, fullname, unit_id, division_id, role_id, is_changed_password, email, basic_salary,is_show_all_monthly_report FROM users WHERE id = ?";

    const result = await this._db.execute(query, [userId]);

    if (!result.length === 0) {
      throw new InvariantError("User tidak ditemukan");
    }
    return result[0];
  }

  async getUsersByIds(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new InvariantError("userIds must be a non-empty array");
    }

    const placeholders = userIds.map(() => "?").join(",");
    const query = `SELECT id FROM users WHERE id IN (${placeholders})`;
    const [results] = await this._db.execute(query, userIds);

    const foundIds = results.map((row) => row.id);
    const notFoundIds = userIds.filter((id) => !foundIds.includes(id));

    if (notFoundIds.length > 0) {
      throw new InvariantError(`User IDs not found: ${notFoundIds.join(", ")}`);
    }
    return results;
  }

  async getUsers(userId, limit, offset, search = "", statusFilter = []) {
    try {
      let query = `
      SELECT
        u.id,
        u.username,
        u.fullname,
        u.role_id as roleId,
        u.admin_status,
        u.basic_salary as basicSalary,
        d.id as divisionId,
        d.name as divisionName,
        un.id as unitId,
        un.name as unitName
      FROM
        users u
      LEFT JOIN
        divisions d ON u.division_id = d.id
      LEFT JOIN
        units un ON u.unit_id = un.id
    `;

      const conditions = [];
      const values = [];

      // ✓ filter by fullname
      if (search) {
        conditions.push(`u.fullname LIKE ?`);
        values.push(`%${search}%`);
      }

      // ✓ filter by is_active if provided
      if (Array.isArray(statusFilter) && statusFilter.length > 0) {
        const placeholders = statusFilter.map(() => "?").join(", ");
        conditions.push(`u.is_active IN (${placeholders})`);
        values.push(...statusFilter);
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(" AND ");
      }

      // ORDER + LIMIT/OFFSET
      query += `
      ORDER BY u.fullname ASC
      LIMIT ? OFFSET ?
    `;
      values.push(limit, offset);
      console.log("Executing Query:", query);
      console.log("With Values:", values);
      console.log("Final Query:", query);
      const [rows] = await this._db.query(query, values);
      return rows;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getUserCount(search = "", statusFilter = []) {
    let query = `
    SELECT COUNT(*) AS count
    FROM users u
  `;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`u.fullname LIKE ?`);
      params.push(`%${search}%`);
    }

    if (Array.isArray(statusFilter) && statusFilter.length > 0) {
      const placeholders = statusFilter.map(() => "?").join(", ");
      conditions.push(`u.is_active IN (${placeholders})`);
      params.push(...statusFilter);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const [rows] = await this._db.execute(query, params);
    return parseInt(rows[0].count, 10);
  }

  async getIsUserAdmin(userId) {
    const query = "SELECT admin_status FROM users WHERE id = ?";
    const [result] = await this._db.execute(query, [userId]);

    if (result.length === 0) {
      throw new InvariantError("User tidak ditemukan.");
    }
    if (result[0].admin_status === 0) {
      throw new InvariantError("Anda bukan Admin");
    }
  }

  async getIsChangedPassword(userId) {
    const query = "SELECT is_changed_password FROM users WHERE id = ?";
    const [result] = await this._db.execute(query, [userId]);

    if (result.length === 0) {
      throw new InvariantError("User tidak ditemukan.");
    }
    return result[0].is_changed_password;
  }

  async verifyUserCredential(username, password) {
    const query =
      "SELECT id, password, role_id, admin_status, is_changed_password, fullname FROM users WHERE username = ?";
    const [rows] = await this._db.execute(query, [username]);
    if (rows.length === 0) {
      throw new AuthenticationError("Kredensial yang Anda berikan salah");
    }

    const {
      id,
      password: hashedPassword,
      role_id: roleId,
      admin_status: adminStatus,
      fullname: fullname,
      is_changed_password: isChanged,
    } = rows[0];

    const match = await bcrypt.compare(password, hashedPassword);

    if (!match) {
      throw new AuthenticationError("Kredensial yang Anda berikan salah");
    }

    return { id, roleId, adminStatus, fullname, isChanged };
  }

  async getUserLeaderUnit(unitId, roleId) {
    console.log(`unit ${unitId} role ${roleId}`);
    const query =
      "SELECT id, username, fullname, unit_id, division_id FROM users WHERE unit_id = ? AND role_id = ?";
    const [rows] = await this._db.execute(query, [unitId, roleId]);

    // console.log(`leaderUnit ${JSON.stringify(rows)}`);

    if (rows.length === 0) {
      console.log("Kepala Unit tidak ditemukan");
    }

    // Return only the "id" field
    return rows.map((row) => row.id);
  }

  async getUserLeaderDivision(divisionId, roleId) {
    const query =
      "SELECT id, username, fullname, unit_id, division_id FROM users WHERE division_id = ? AND role_id = ?";
    const [rows] = await this._db.execute(query, [divisionId, roleId]);

    if (rows.length === 0) {
      throw new InvariantError("Kepala Divisi tidak ditemukan");
    }
    console.log(`divisionLeader ${JSON.stringify(rows)}`);
    // Return only the "id" field
    return rows.map((row) => row.id);
  }

  async getDirector(roleId) {
    const query =
      "SELECT id, username, fullname, unit_id, division_id FROM users WHERE role_id = ?";
    const [rows] = await this._db.execute(query, [roleId]);

    if (rows.length === 0) {
      throw new InvariantError("Direktur tidak ditemukan");
    }

    // Return only the "id" field
    return rows.map((row) => row.id);
  }

  async getUserToNotify(
    roleId,
    unitId = null,
    divisionId = null,
    isPicUserId = false,
    ownerId = null
  ) {
    // try {
    console.log(
      `roleId: ${roleId}, unitId: ${unitId}, divisionId: ${divisionId}, isPicUserId: ${isPicUserId}, ownerId: ${ownerId}`
    );
    let userSets = new Set();

    if (isPicUserId) {
      console.log("Notifying all relevant users");
      const unitLeader = await this.getUserLeaderUnit(unitId, 3);
      const divisionLeader = await this.getUserLeaderDivision(divisionId, 2);
      const director = await this.getDirector(1);

      // Use Set to prevent duplicate user IDs
      unitLeader
        .concat(divisionLeader, director)
        .forEach((id) => userSets.add(id));
    } else {
      let results = [];
      switch (roleId) {
        case 4: // Notify unit leader
          results = await this.getUserLeaderUnit(unitId, 3);
          break;
        case 3: // Notify division leader
          console.log("Getting division leader");
          results = await this.getUserLeaderDivision(divisionId, 2);
          break;
        case 2: // Notify director
          console.log("Notify director");
          results = await this.getDirector(1);
          break;
        case 1: // Notify All
          const unitLeader = await this.getUserLeaderUnit(unitId, 3);
          const divisionLeader = await this.getUserLeaderDivision(
            divisionId,
            2
          );
          unitLeader.concat(divisionLeader).forEach((id) => userSets.add(id));
          break;
        default:
          throw new InvariantError(`Invalid role Id ${roleId}`);
      }
      results.forEach((id) => userSets.add(id));
    }

    // Add ownerId if provided
    if (ownerId) {
      userSets.add(ownerId);
    }

    // Convert Set back to Array for return
    const finalResults = Array.from(userSets);
    console.log(`Users to notify: ${finalResults.length}`);
    return finalResults;
    // } catch (error) {
    //   console.error(error);
    // }
  }

  /**
   * Ambil dua level di atas current user:
   * - Jika roleId = 4 (staff) → ambil division head (role=2) + director (role=1)
   * - Jika roleId = 3 (unit head) → ambil director (role=1) saja (karena hanya 1 level di atas)
   * - Jika roleId = 2 (division head) → ambil director (role=1) saja (hanya 1 level di atas)
   * - Jika roleId = 1 (director) → tidak ada level di atas → kembalikan array kosong
   */
  async getUserToNotifyTwoLevels(roleId, unitId = null, divisionId = null) {
    const twoLevelsSet = new Set();

    switch (roleId) {
      case 4: {
        // Staff → dua level di atas: Kepala Unit (role=3) & Kepala Divisi (role=2)
        if (unitId) {
          // 3 = role_id untuk Kepala Unit
          const unitHeads = await this.getUserLeaderUnit(unitId, 3);
          unitHeads.forEach((id) => twoLevelsSet.add(id));
        }
        if (divisionId) {
          // 2 = role_id untuk Kepala Divisi
          const divisionHeads = await this.getUserLeaderDivision(divisionId, 2);
          divisionHeads.forEach((id) => twoLevelsSet.add(id));
        }
        break;
      }
      case 3: {
        // Kepala Unit → dua level di atas: Kepala Divisi (role=2) & Direktur (role=1)
        if (divisionId) {
          // 2 = role_id untuk Kepala Divisi
          const divisionHeads = await this.getUserLeaderDivision(divisionId, 2);
          divisionHeads.forEach((id) => twoLevelsSet.add(id));
        }
        {
          // 1 = role_id untuk Direktur
          const directors = await this.getDirector(1);
          directors.forEach((id) => twoLevelsSet.add(id));
        }
        break;
      }
      case 2: {
        // Kepala Divisi → satu level di atas: Direktur (role=1)
        {
          const directors = await this.getDirector(1);
          directors.forEach((id) => twoLevelsSet.add(id));
        }
        break;
      }
      case 1: {
        // Direktur → tidak ada level di atas
        break;
      }
      default: {
        throw new InvariantError(`Invalid role Id ${roleId}`);
      }
    }

    return Array.from(twoLevelsSet);
  }

  // async getUserToNotifyWithEmail(
  //   roleId,
  //   unitId = null,
  //   divisionId = null,
  //   isPicUserId = false,
  //   ownerId = null
  // ) {
  //   // try {
  //   console.log(
  //     `roleId: ${roleId}, unitId: ${unitId}, divisionId: ${divisionId}, isPicUserId: ${isPicUserId}, ownerId: ${ownerId}`
  //   );
  //   let userSets = new Set();

  //   if (isPicUserId) {
  //     console.log("Notifying all relevant users");
  //     const unitLeader = await this.getUserLeaderUnit(unitId, 3);
  //     const divisionLeader = await this.getUserLeaderDivision(divisionId, 2);
  //     const director = await this.getDirector(1);

  //     // Use Set to prevent duplicate user IDs
  //     unitLeader
  //       .concat(divisionLeader, director)
  //       .forEach((id) => userSets.add(id));
  //   } else {
  //     let results = [];
  //     switch (roleId) {
  //       case 4: // Notify unit leader
  //         results = await this.getUserLeaderUnit(unitId, 3);
  //         break;
  //       case 3: // Notify division leader
  //         console.log("Getting division leader");
  //         results = await this.getUserLeaderDivision(divisionId, 2);
  //         break;
  //       case 2: // Notify director
  //         console.log("Notify director");
  //         results = await this.getDirector(1);
  //         break;
  //       case 1: // Notify All
  //         const unitLeader = await this.getUserLeaderUnit(unitId, 3);
  //         const divisionLeader = await this.getUserLeaderDivision(
  //           divisionId,
  //           2
  //         );
  //         unitLeader.concat(divisionLeader).forEach((id) => userSets.add(id));
  //         break;
  //       default:
  //         throw new InvariantError(`Invalid role Id ${roleId}`);
  //     }
  //     results.forEach((id) => userSets.add(id));
  //   }

  //   // Add ownerId if provided
  //   if (ownerId) {
  //     userSets.add(ownerId);
  //   }

  //   // Convert Set back to Array for return
  //   const finalResults = Array.from(userSets);
  //   console.log(`Users to notify email: ${finalResults.length}`);

  //   // 👉 Call getUserEmailsByIds here and return the result
  //   const emails = await this.getUserEmailsByIds(finalResults);
  //   return emails;
  //   // } catch (error) {
  //   //   console.error(error);
  //   // }
  // }

  async getUserEmailsByIds(userIds) {
    console.log("UserId For Email: ", userIds);
    if (!userIds || userIds.length === 0) {
      console.log("No user IDs provided to get emails.");
      return [];
    }

    const placeholders = userIds.map(() => `?`).join(", ");
    const query = `SELECT id, email FROM users WHERE id IN (${placeholders})`;

    console.log("Fetching emails with query:", query);
    console.log("User IDs:", userIds);

    const [rows] = await this._db.execute(query, userIds);

    const emails = rows.filter((user) => user.email).map((user) => user.email);

    console.log("Fetched emails:", emails);
    return emails;
  }

  async exportUsersExcel() {
    const [rows] = await this._db.execute(`
    SELECT 
      u.username, 
      u.fullname, 
      u.basic_salary, 
      u.division_id, 
      u.unit_id, 
      un.name AS unit_name,
      u.role_id, 
      u.hired_date
    FROM users u
    LEFT JOIN units un ON u.unit_id = un.id
    ORDER BY u.fullname ASC
  `);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Users");

    ws.columns = [
      { header: "Username", key: "username", width: 20 },
      { header: "Full Name", key: "fullname", width: 30 },
      { header: "Basic Salary", key: "basic_salary", width: 15 },
      { header: "Division ID", key: "division_id", width: 15 },
      { header: "Unit ID", key: "unit_id", width: 15 },
      { header: "Unit Name", key: "unit_name", width: 25 }, // ✅ new column
      { header: "Role ID", key: "role_id", width: 10 },
      { header: "Hired Date", key: "hired_date", width: 20 },
    ];

    rows.forEach((row) => ws.addRow(row));

    return wb.xlsx.writeBuffer(); // return Excel buffer to be downloaded
  }

  async importUserSalaries(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet("Users") || wb.worksheets[0];
    const results = [];

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const username = row.getCell("A").text.trim();
      const salaryRaw = row.getCell("C").value;
      const basicSalary = parseFloat(salaryRaw) || 0;

      if (!username) {
        results.push({
          row: i,
          username: null,
          action: "skipped (empty username)",
        });
        continue;
      }

      try {
        const [userRows] = await this._db.execute(
          `SELECT id FROM users WHERE username = ?`,
          [username]
        );

        if (!userRows.length) {
          results.push({
            row: i,
            username,
            action: "skipped (user not found)",
          });
          continue;
        }

        const userId = userRows[0].id;

        const [updateRes] = await this._db.execute(
          `UPDATE users SET basic_salary = ? WHERE id = ?`,
          [basicSalary, userId]
        );

        if (updateRes.affectedRows === 1) {
          results.push({
            row: i,
            username,
            action: "updated",
            salary: basicSalary,
          });
        } else {
          results.push({
            row: i,
            username,
            action: "skipped (update failed)",
          });
        }
      } catch (err) {
        results.push({
          row: i,
          username,
          action: "error",
          error: err.message,
        });
      }
    }

    return results;
  }
}

module.exports = UsersService;
