// src/services/mssql/PayrollComponentsService.js

const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");
const database = require("../../database");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");
const csvParse = require("csv-parse");

class PayrollComponentsService {
  constructor() {
    this._db = database.getConnection();
  }

  // --- CRUD ----------------------------------------------------------------

  async createComponent({ name, description = null, type, sort_order = 0 }) {
    const id = `comp-${Date.now()}`; // or nanoid
    const query = `
      INSERT INTO payroll_components
        (id, name, description, type, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await this._db.execute(query, [
      id,
      name,
      description,
      type,
      sort_order,
    ]);
    if (result.affectedRows !== 1) {
      throw new InvariantError("Gagal menambah komponen");
    }
    return id;
  }

  async getComponents(limit = 100, offset = 0, search = "") {
    let query = `
    SELECT id, name, description, type, sort_order
    FROM payroll_components
  `;
    const params = [];

    if (search) {
      query += ` WHERE name LIKE ? OR type LIKE ?`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // **INTERPOLATE** limit & offset instead of binding them
    query += `
    ORDER BY sort_order ASC, name ASC
    LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}
  `;

    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  async getComponentById(id) {
    const [rows] = await this._db.execute(
      `SELECT id, name, description, type, sort_order
       FROM payroll_components
       WHERE id = ?`,
      [id]
    );
    if (!rows.length) {
      throw new NotFoundError("Komponen tidak ditemukan");
    }
    return rows[0];
  }

  async updateComponent(
    id,
    { name, description = null, type, sort_order = 0 }
  ) {
    const [result] = await this._db.execute(
      `
      UPDATE payroll_components
      SET name = ?, description = ?, type = ?, sort_order = ?
      WHERE id = ?
      `,
      [name, description, type, sort_order, id]
    );
    if (result.affectedRows === 0) {
      throw new NotFoundError("Gagal memperbarui komponen");
    }
  }

  async deleteComponent(id) {
    const [result] = await this._db.execute(
      `DELETE FROM payroll_components WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      throw new NotFoundError("Gagal menghapus komponen");
    }
  }

  // --- COUNT for paging ----------------------------------------------------

  async getComponentsCount(search = "") {
    let query = `
    SELECT COUNT(*) AS count
    FROM payroll_components
  `;
    const params = [];

    if (search) {
      query += ` WHERE name LIKE ? OR type LIKE ?`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await this._db.execute(query, params);
    return rows[0].count;
  }

  // --- CSV export/import ---------------------------------------------------
  /**
   * Parse a CSV string and upsert each row.
   * Expects columns: id, name, description, type, sort_order
   * @returns Array of { id, action }
   */
  async importComponentsCsv(csvText) {
    const records = csvParse(csvText, {
      columns: true,
      skip_empty_lines: true,
    });
    const results = [];
    for (const row of records) {
      const payload = {
        name: row.name,
        description: row.description || null,
        type: row.type,
        sort_order: parseInt(row.sort_order, 10) || 0,
      };
      if (row.id) {
        try {
          await this.updateComponent(row.id, payload);
          results.push({ id: row.id, action: "updated" });
          continue;
        } catch {
          // fallthrough to create
        }
      }
      const newId = await this.createComponent(payload);
      results.push({ id: newId, action: "created" });
    }
    return results;
  }

  // --- Excel export/import -------------------------------------------------

  /**
   * Export all components as an Excel workbook buffer.
   */
  async exportComponentsExcel() {
    const rows = await this.getComponents(10_000, 0);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Components");
    ws.columns = [
      { header: "ID", key: "id", width: 30 },
      { header: "Name", key: "name", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Type", key: "type", width: 15 },
      { header: "Sort Order", key: "sort_order", width: 10 },
    ];
    rows.forEach((r) => ws.addRow(r));
    return wb.xlsx.writeBuffer();
  }

  /**
   * Import components from an Excel buffer.
   * @returns Array of { id, action }
   */
  async importComponentsExcel(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet("Components") || wb.worksheets[0];
    const results = [];
    // skip header row
    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const [idCell, nameCell, descCell, typeCell, sortCell] =
        row.values.slice(1);
      const payload = {
        name: nameCell?.toString(),
        description: descCell?.toString() || null,
        type: typeCell?.toString(),
        sort_order: parseInt(sortCell, 10) || 0,
      };
      const id = idCell?.toString();
      if (id) {
        try {
          await this.updateComponent(id, payload);
          results.push({ id, action: "updated" });
          continue;
        } catch {}
      }
      const newId = await this.createComponent(payload);
      results.push({ id: newId, action: "created" });
    }
    return results;
  }
}

module.exports = PayrollComponentsService;
