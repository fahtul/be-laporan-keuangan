// api/salary/handler.js
const autoBind = require("auto-bind");
const ExcelJS = require("exceljs");
const path = require("path");

class SalaryHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  /**
   * POST /salary/run?year=&month=
   */
  async postRunSalaryHandler(request, h) {
    try {
      this._validator.validateSalaryRunQuery(request.query);
      const userId = request.auth.credentials.id;
      const { year, month } = request.query;

      const { recordId, totalSalary } =
        await this._service.calculateAndSaveMonthly(
          userId,
          parseInt(year, 10),
          parseInt(month, 10)
        );

      return h
        .response({
          status: "success",
          message: "Gaji berhasil dihitung dan disimpan",
          data: { recordId, totalSalary },
        })
        .code(201);
    } catch (error) {
      console.error(error); // Log the error for debugging
    }
  }

  /**
   * GET /salary/history
   */
  async getSalaryHistoryHandler(request, h) {
    const userId = request.auth.credentials.id;
    const records = await this._service.getHistory(userId);

    return {
      status: "success",
      data: { records },
    };
  }

  /**
   * POST /salary/run/all?year=&month=
   * Calculates & saves salary for *all* users.
   */
  async postRunSalaryForAllHandler(request, h) {
    try {
      this._validator.validateSalaryRunQuery(request.query);
      const { year, month } = request.query;

      const resultMap = await this._service.calculateAndSaveMonthlyForAll(
        parseInt(year, 10),
        parseInt(month, 10)
      );

      return h
        .response({
          status: "success",
          message: "Gaji semua karyawan berhasil dihitung dan disimpan",
          data: { records: resultMap },
        })
        .code(201);
    } catch (error) {
      console.error(error);
      return h.response({ status: "error", message: error.message }).code(500);
    }
  }

  /**
   * GET /salary/history/all
   * Returns salary history for *all* users.
   */
  async getAllSalaryHistoryHandler(request, h) {
    try {
      const histories = await this._service.getAllHistory();

      return h.response({
        status: "success",
        data: { histories },
      });
    } catch (error) {
      console.error(error);
      return h.response({ status: "error", message: error.message }).code(500);
    }
  }
  /**
   * Export daily overtime + absence summary
   */
  // async exportDailySummary(data, filePath) {
  //   const workbook = new ExcelJS.Workbook();
  //   const sheet = workbook.addWorksheet("Summary");

  //   // Header
  //   sheet.columns = [
  //     { header: "Tanggal", key: "date", width: 12 },
  //     { header: "Keterangan", key: "type", width: 15 },
  //     { header: "Jumlah", key: "count", width: 10 },
  //     { header: "Unit", key: "unit", width: 20 },
  //     { header: "Nama", key: "name", width: 30 },
  //   ];

  //   // Style for header
  //   sheet.getRow(1).font = { bold: true };

  //   // Group data by date
  //   const grouped = data.reduce((acc, row) => {
  //     if (!acc[row.date]) acc[row.date] = [];
  //     acc[row.date].push(row);
  //     return acc;
  //   }, {});

  //   // Loop per date
  //   Object.keys(grouped).forEach((date) => {
  //     const dayRows = grouped[date];

  //     // Overtime rows
  //     dayRows
  //       .filter((r) => r.type === "Lembur")
  //       .forEach((r) => {
  //         sheet.addRow({
  //           date,
  //           type: "Lembur",
  //           count: r.count,
  //           unit: r.unit,
  //           name: r.name,
  //         });
  //       });

  //     // Add absence rows (Terlambat, Izin, Sakit, Alfa)
  //     ["Terlambat", "Izin", "Sakit", "Alfa"].forEach((abs) => {
  //       const record = dayRows.find((r) => r.type === abs);
  //       sheet.addRow({
  //         date: "",
  //         type: abs,
  //         count: record ? record.count : 0,
  //         unit: "",
  //         name: record && record.name ? record.name : "",
  //       });
  //     });

  //     // Empty line separator
  //     sheet.addRow({});
  //   });

  //   // Save file
  //   await workbook.xlsx.writeFile(filePath);
  //   console.log(`Export saved to ${filePath}`);
  // }

  // async exportDailySummary(request, h) {
  //   try {
  //     const { year, month } = request.query;

  //     if (!year || !month) {
  //       return h.response({ error: "year and month are required" }).code(400);
  //     }

  //     const fileName = `daily-summary-${year}-${String(month).padStart(
  //       2,
  //       "0"
  //     )}.xlsx`;
  //     const filePath = path.join(__dirname, fileName);

  //     await this._service.exportDailySummary(year, month, filePath);

  //     return h.file(filePath, {
  //       mode: "attachment",
  //       filename: fileName,
  //     });
  //   } catch (err) {
  //     console.error("Export Daily Summary Error:", err);
  //     return h.response({ error: err.message }).code(500);
  //   }
  // }

  async exportDailySummary(request, h) {
    try {
      const { year, month } = request.query;

      if (!year || !month) {
        return h.response({ error: "year and month are required" }).code(400);
      }

      const filePath = path.join(
        __dirname,
        `daily-summary-${year}-${month}.xlsx`
      );

      await this._service.exportDailySummary(year, month, filePath);

      return h.file(filePath, {
        mode: "attachment",
        filename: `daily-summary-${year}-${month}.xlsx`,
      });
    } catch (err) {
      console.error("Export Daily Summary Error:", err);
      return h.response({ error: err.message }).code(500);
    }
  }
}

module.exports = SalaryHandler;
