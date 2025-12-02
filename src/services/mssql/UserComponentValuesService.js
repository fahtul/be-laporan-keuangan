// src/services/mssql/UserComponentValuesService.js

const { nanoid } = require("nanoid");
const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");
const database = require("../../database");
const csvParse = require("csv-parse");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");

class UserComponentValuesService {
  constructor() {
    this._db = database.getConnection();
  }

  // --- CRUD ---------------------------------------------------------------

  /**
   * Create or update a user‐component override.
   */
  async upsert({ userId, componentId, amount }) {
    // try update first
    const [upd] = await this._db.execute(
      `UPDATE user_component_values
         SET amount = ?
       WHERE user_id = ? AND component_id = ?`,
      [amount, userId, componentId]
    );
    if (upd.affectedRows) return;

    // otherwise insert
    const id = nanoid(16);
    const [ins] = await this._db.execute(
      `INSERT INTO user_component_values
        (id, user_id, component_id, amount)
       VALUES (?, ?, ?, ?)`,
      [id, userId, componentId, amount]
    );
    if (ins.affectedRows !== 1) {
      throw new InvariantError("Gagal menyimpan nilai komponen user");
    }
    return id;
  }

  /**
   * List overrides with paging & optional search (by user or component name).
   */
  async getValues(limit = 10, offset = 0, search = "") {
    let query = `
      SELECT
        ucv.id,
        ucv.user_id,
        u.username        AS user_name,
        u.fullname        AS fullname,
        ucv.component_id,
        pc.name           AS component_name,
        pc.type           AS component_type,
        ucv.amount,
        ucv.created_at,
        ucv.updated_at
      FROM user_component_values ucv
      JOIN users              u  ON u.id = ucv.user_id
      JOIN payroll_components pc ON pc.id = ucv.component_id
    `;
    const params = [];
    if (search) {
      query += `
        WHERE u.username LIKE ? OR pc.name LIKE ?
      `;
      const like = `%${search}%`;
      params.push(like, like);
    }
    query += `
      ORDER BY ucv.updated_at DESC
      
    `;
    params.push(limit, offset);
    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  /**
   * Total count for paging.
   */
  async getValuesCount(search = "") {
    let query = `
      SELECT COUNT(*) AS count
      FROM user_component_values ucv
      JOIN users              u  ON u.id = ucv.user_id
      JOIN payroll_components pc ON pc.id = ucv.component_id
    `;
    const params = [];
    if (search) {
      query += ` WHERE u.username LIKE ? OR pc.name LIKE ?`;
      const like = `%${search}%`;
      params.push(like, like);
    }
    const [rows] = await this._db.execute(query, params);
    return rows[0].count;
  }

  /**
   * Fetch one override by its PK.
   */
  async getById(id) {
    const [rows] = await this._db.execute(
      `
      SELECT
        ucv.id,
        ucv.user_id,
        ucv.component_id,
        ucv.amount,
        ucv.created_at,
        ucv.updated_at,
        pc.name       AS component_name,
        pc.type       AS component_type
      FROM user_component_values ucv
      JOIN payroll_components pc ON pc.id = ucv.component_id
      WHERE ucv.id = ?
      `,
      [id]
    );
    if (!rows.length) throw new NotFoundError("Override tidak ditemukan");
    return rows[0];
  }

  /**
   * Delete one override.
   */
  async delete(id) {
    const [res] = await this._db.execute(
      `DELETE FROM user_component_values WHERE id = ?`,
      [id]
    );
    if (res.affectedRows === 0) {
      throw new NotFoundError("Override tidak ditemukan");
    }
  }

  // --- CSV export/import ---------------------------------------------------

  /**
   * Export all as CSV string.
   */
  async exportCsv() {
    // pull all for export (no paging)
    const rows = await this.getValues(10_000, 0);
    const parser = new Parser({
      fields: [
        "id",
        "user_id",
        "user_name",
        "component_id",
        "component_name",
        "amount",
      ],
    });
    return parser.parse(rows);
  }

  /**
   * Import CSV text; upsert each row.
   * returns [{ id, action }]
   */
  async importCsv(csvText) {
    const records = csvParse(csvText, {
      columns: true,
      skip_empty_lines: true,
    });
    const results = [];
    for (const r of records) {
      const payload = {
        userId: r.user_id,
        componentId: r.component_id,
        amount: parseFloat(r.amount) || 0,
      };
      try {
        // existence check
        const [exists] = await this._db.execute(
          `SELECT 1 FROM user_component_values
           WHERE user_id = ? AND component_id = ?`,
          [payload.userId, payload.componentId]
        );
        if (exists.length) {
          await this.upsert(payload);
          results.push({
            id: `${payload.userId}|${payload.componentId}`,
            action: "updated",
          });
        } else {
          const id = await this.upsert(payload);
          results.push({ id, action: "created" });
        }
      } catch {
        // skip on error
      }
    }
    return results;
  }

  // --- Excel export/import -------------------------------------------------

  /**
   * Export as XLSX buffer.
   */
  async exportExcel() {
    const rows = await this.getValues(10_000, 0);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("UserComponents");
    ws.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "User ID", key: "user_id", width: 20 },
      { header: "User Name", key: "user_name", width: 25 },
      { header: "Full Name", key: "fullname", width: 25 },
      { header: "Component Name", key: "component_name", width: 25 },
      { header: "Amount", key: "amount", width: 15 },
    ];
    rows.forEach((r) => ws.addRow(r));
    return wb.xlsx.writeBuffer();
  }

  /**
   * Import from XLSX buffer.
   * returns [{ id, action }]
   */
  // async importExcel(buffer) {
  //   const wb = new ExcelJS.Workbook();
  //   await wb.xlsx.load(buffer);
  //   const ws = wb.getWorksheet("UserComponents") || wb.worksheets[0];
  //   const results = [];

  //   for (let i = 2; i <= ws.rowCount; i++) {
  //     const row = ws.getRow(i);
  //     const username = row.getCell("A").text.trim();
  //     const componentName = row.getCell("C").text.trim();
  //     const amount = parseFloat(row.getCell("D").value) || 0;

  //     // 1. Lookup user_id
  //     const [userRow] = await this._db.execute(
  //       `SELECT id FROM users WHERE username = ? LIMIT 1`,
  //       [username]
  //     );
  //     if (!userRow.length) {
  //       results.push({
  //         id: `${username}|${componentName}`,
  //         action: "skipped (user not found)",
  //       });
  //       continue;
  //     }
  //     const userId = userRow[0].id;

  //     // 2. Lookup component_id
  //     const [componentRow] = await this._db.execute(
  //       `SELECT id FROM payroll_components WHERE name = ? LIMIT 1`,
  //       [componentName]
  //     );
  //     if (!componentRow.length) {
  //       results.push({
  //         id: `${username}|${componentName}`,
  //         action: "skipped (component not found)",
  //       });
  //       continue;
  //     }
  //     const componentId = componentRow[0].id;

  //     // 3. Upsert
  //     const payload = { userId, componentId, amount };

  //     try {
  //       const [exists] = await this._db.execute(
  //         `SELECT id FROM user_component_values WHERE user_id = ? AND component_id = ?`,
  //         [userId, componentId]
  //       );

  //       if (exists.length) {
  //         await this.upsert(payload);
  //         results.push({
  //           id: `${username}|${componentName}`,
  //           action: "updated",
  //         });
  //       } else {
  //         const id = await this.upsert(payload);
  //         results.push({ id, action: "created" });
  //       }
  //     } catch (err) {
  //       results.push({
  //         id: `${username}|${componentName}`,
  //         action: "skipped (error)",
  //         error: err.message,
  //       });
  //     }
  //   }

  //   return results;
  // }

  /**
   * Import from a WIDE XLSX:
   *   username | <Component A> | <Component B> | ...
   * Component column headers must match payroll_components.name exactly.
   * returns [{ key, action, details? }]
   */
  async importExcel(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const ws = wb.getWorksheet("UserComponents") || wb.worksheets[0];
    if (!ws) throw new InvariantError("Worksheet tidak ditemukan");

    // --- Helpers -----------------------------------------------------------
    const cellToNumber = (cell) => {
      if (!cell) return 0;
      const v = cell.value;
      if (v == null) return 0;
      if (typeof v === "number") return v;
      // Excel sometimes stores numbers as strings with commas
      const s = String(v).trim().replace(/\s+/g, "").replace(/,/g, "");
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };

    const trimLower = (s) =>
      String(s || "")
        .trim()
        .toLowerCase();

    // --- 1) Read header row ------------------------------------------------
    const headerRow = ws.getRow(1);
    const headers = [];
    for (let c = 1; c <= headerRow.cellCount; c++) {
      headers.push(String(headerRow.getCell(c).text || "").trim());
    }

    // Expect first column = "username"
    if (!headers.length || trimLower(headers[0]) !== "username") {
      throw new InvariantError(
        `Kolom pertama harus "username". Ditemukan: "${headers[0] || ""}"`
      );
    }

    // Component columns are everything after column A
    const componentHeaders = headers.slice(1).filter((h) => h.length > 0);

    // --- 2) Build maps from DB (components & users) ------------------------
    // 2a) Components: name -> id
    const [compRows] = await this._db.execute(
      `SELECT id, name, type FROM payroll_components`
    );
    const compByName = new Map(); // exact name match
    const compByNameFold = new Map(); // lowercase trimmed name match
    for (const r of compRows) {
      compByName.set(r.name, r.id);
      compByNameFold.set(trimLower(r.name), r.id);
    }

    // Resolve each component header to an id (case-insensitive)
    const componentIdByHeader = new Map();
    const unknownComponents = [];
    for (const name of componentHeaders) {
      const id =
        compByName.get(name) || compByNameFold.get(trimLower(name)) || null;
      if (id) componentIdByHeader.set(name, id);
      else unknownComponents.push(name);
    }

    // 2b) Gather all usernames present to resolve to user IDs in one query
    const usernames = new Set();
    for (let r = 2; r <= ws.rowCount; r++) {
      const uname = ws.getRow(r).getCell(1).text?.trim();
      if (uname) usernames.add(uname);
    }

    let userIdByUsername = new Map();
    if (usernames.size) {
      // Chunk the IN clause if needed
      const namesArr = Array.from(usernames);
      userIdByUsername = new Map();

      const chunkSize = 500;
      for (let i = 0; i < namesArr.length; i += chunkSize) {
        const chunk = namesArr.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const [urows] = await this._db.execute(
          `SELECT id, username FROM users WHERE username IN (${placeholders})`,
          chunk
        );
        for (const u of urows) userIdByUsername.set(u.username, u.id);
      }
    }

    // --- 3) Iterate rows and upsert amounts --------------------------------
    const results = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const username = row.getCell(1).text?.trim();
      if (!username) {
        results.push({
          key: `row ${r}`,
          action: "skipped",
          details: "username kosong",
        });
        continue;
      }

      const userId = userIdByUsername.get(username);
      if (!userId) {
        results.push({
          key: username,
          action: "skipped",
          details: "user tidak ditemukan",
        });
        continue;
      }

      // Go through each component column
      for (let c = 2; c <= headers.length; c++) {
        const headerName = headers[c - 1];
        if (!headerName) continue;

        const componentId = componentIdByHeader.get(headerName);
        if (!componentId) {
          // unknown component (not in payroll_components)
          continue;
        }

        const amount = cellToNumber(row.getCell(c));
        // Optional: skip zeros; comment out if you want zeros to be stored explicitly
        if (!Number.isFinite(amount) || amount === 0) continue;

        // Upsert (uses your existing helper)
        try {
          await this.upsert({ userId, componentId, amount });
          results.push({
            key: `${username}|${headerName}`,
            action: "upserted",
            amount,
          });
        } catch (err) {
          results.push({
            key: `${username}|${headerName}`,
            action: "error",
            details: err.message,
          });
        }
      }
    }

    // Report unknown component columns (if any)
    if (unknownComponents.length) {
      results.unshift({
        key: "warning",
        action: "unknown_components",
        details: unknownComponents.join(", "),
      });
    }

    return results;
  }

  async bulkUpsert({ userId, items }) {
    const results = [];
    for (const { componentId, amount } of items) {
      // reuse upsert
      const id = await this.upsert({ userId, componentId, amount });
      results.push({ componentId, id });
    }
    return results;
  }
}

module.exports = UserComponentValuesService;
