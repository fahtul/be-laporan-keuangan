const InvariantError = require("../../exceptions/InvariantError");
const database = require("../../database");

class AuthenticationsService {
  constructor() {
    this._db = database.getConnection();
  }

  async addRefreshToken(token) {
    const query = "INSERT INTO authentications VALUES(?)";
    await this._db.execute(query, [token]);
  }

  

  async verifyRefreshToken(token) {
    const query = "SELECT token FROM authentications WHERE token = ?";
    const [rows] = await this._db.execute(query, [token]);

    if (rows.length === 0) {
      throw new InvariantError("Refresh token tidak valid");
    }
  }

  async deleteRefreshToken(token) {
    const query = "DELETE FROM authentications WHERE token = ?";
    await this._db.execute(query, [token]);
  }
}

module.exports = AuthenticationsService;
