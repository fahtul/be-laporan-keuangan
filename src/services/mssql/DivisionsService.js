const { nanoid } = require("nanoid");
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");

class DivisionsService {
  constructor() {
    this._db = database.getConnection();
  }

  async addDivision({ name }) {
    const id = nanoid(16);
    const query = "INSERT INTO divisions VALUES(?, ?)";
    const values = [id, name];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows === 0) {
      throw new InvariantError("Divisi gagal ditambahkan.");
    }
    return id;
  }

  async getDivisions() {
    const query = "SELECT * FROM divisions";
    const [result] = await this._db.execute(query);

    if (result.length === 0) {
      throw new NotFoundError("Divisi tidak ditemukan.");
    }

    return result;
  }

  async getDivisionById(divisionId) {
    const query = "SELECT id FROM divisions WHERE id =?";
    const [rows] = await this._db.execute(query, [divisionId]);
    if (rows.length === 0) {
      throw new InvariantError("Divisi tidak ditemukan.");
    }
    return rows[0].id.toString();
  }
}

module.exports = DivisionsService;
