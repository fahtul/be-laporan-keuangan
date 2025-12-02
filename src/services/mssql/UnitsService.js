const { nanoid } = require("nanoid");
const database = require("../../database");
const InvariantError = require("../../exceptions/InvariantError");

class DivisionsService {
  constructor() {
    this._db = database.getConnection();
  }

  async addUnit({ name, divisionId }) {
    const id = nanoid(16);
    const query = "INSERT INTO units VALUES(?, ?, ?)";
    const values = [id, name, divisionId];
    const [result] = await this._db.execute(query, values);

    if (result.affectedRows !== 1) {
      throw new InvariantError("Unit gagal ditambahkan.");
    }
    return id;
  }

  async getUnitById(unitId) {
    const query = "SELECT division_id FROM units WHERE id =?";
    const [rows] = await this._db.execute(query, [unitId]);
    if (rows.length === 0) {
      throw new InvariantError("Unit tidak ditemukan.");
    }

    return rows[0].division_id.toString();
  }

  async getUnits() {
    const query = "SELECT * FROM units";
    const result = await this._db.execute(query);
    if (result.length === 0) {
      throw new InvariantError("Unit tidak ditemukan.");
    }
  
    return result[0]; 
  }
}

module.exports = DivisionsService;
