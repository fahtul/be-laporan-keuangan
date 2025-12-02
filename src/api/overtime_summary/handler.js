// src/api/overtime/handler.js
const autoBind = require("auto-bind");

function toCsv(headers, rows) {
  // very small CSV builder with quotes, doubles "" within values
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headers.map(esc).join(",");
  const body = rows
    .map((r) => headers.map((h) => esc(r[h])).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

class OvertimeHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async getMonthlySummaryHandler(request, h) {
    this._validator.validateMonthlySummaryQuery(request.query);
    const { year, month, status } = request.query;
    const data = await this._service.getMonthlySummary({ year, month, status });
    return h.response({ status: "success", data });
  }

  async getUserOvertimeDetailHandler(request, h) {
    this._validator.validateMonthlySummaryQuery(request.query);
    const { userId } = request.params;
    const { year, month } = request.query;
    const data = await this._service.getUserOvertimeDetail({
      userId,
      year,
      month,
    });
    return h.response({ status: "success", data });
  }

  async getYearlyByMonthSummaryHandler(request, h) {
    this._validator.validateYearlyByMonthQuery(request.query);
    const { year, status } = request.query;
    const data = await this._service.getYearlyByMonthSummary({ year, status });
    return h.response({ status: "success", data });
  }

  async getUnitSummaryHandler(request, h) {
    this._validator.validateMonthlySummaryQuery(request.query);
    const { year, month, status } = request.query;
    const data = await this._service.getUnitSummary({ year, month, status });
    return h.response({ status: "success", data });
  }

  async getUnitDetailSummaryHandler(request, h) {
    this._validator.validateUnitDetailQuery({
      params: request.params,
      query: request.query,
    });
    const { unitId } = request.params;
    const { year, month, status } = request.query;
    const data = await this._service.getUnitDetailSummary({
      unitId,
      year,
      month,
      status,
    });
    return h.response({ status: "success", data });
  }

  // -------------------- EXPORTS --------------------

  /**
   * GET /overtime/summary/export?year=&month=&status=&group=user|unit
   * - group=user (default): export per user rows
   * - group=unit: export per unit rows
   */
  async exportMonthlySummaryHandler(request, h) {
    this._validator.validateExportMonthly(request.query);
    const { year, month, status, group = "user" } = request.query;

    let data;
    if (group === "unit") {
      data = await this._service.getUnitSummary({ year, month, status });
      const headers = [
        "unit_id",
        "unit_name",
        "users",
        "overtime_hours",
        "overtime_amount",
        "year",
        "month",
        "from_date",
        "to_date",
      ];
      const rows = (data.items || []).map((it) => ({
        unit_id: it.unit_id || "",
        unit_name: it.unit_name || "",
        users: it.users || 0,
        overtime_hours: it.overtime_hours ?? 0,
        overtime_amount: it.overtime_amount ?? 0,
        year: data.year,
        month: data.month,
        from_date: data.from_date || "",
        to_date: data.to_date || "",
      }));
      const csv = toCsv(headers, rows);
      const filename = `overtime_units_${year}_${String(month).padStart(
        2,
        "0"
      )}.csv`;
      return h
        .response(csv)
        .type("text/csv")
        .header("Content-Disposition", `attachment; filename="${filename}"`);
    } else {
      data = await this._service.getMonthlySummary({ year, month, status });
      const headers = [
        "Nama_Karyawan",
        "Rate_Per_Jam",
        "Total_Jam_Lembur",
        "Total_Hari_Lembur",
        "Total_Biaya_Lembur",
      ];
      const rows = (data.items || []).map((it) => ({
        Nama_Karyawan: it.fullname,
        Rate_Per_Jam: it.hourly_ot_rate ?? 0,
        Total_Jam_Lembur: it.overtime_hours ?? 0,
        Total_Hari_Lembur: it.overtime_days ?? 0,
        Total_Biaya_Lembur: it.overtime_amount ?? 0,
      }));
      const csv = toCsv(headers, rows);
      const filename = `overtime_users_${year}_${String(month).padStart(
        2,
        "0"
      )}.csv`;
      return h
        .response(csv)
        .type("text/csv")
        .header("Content-Disposition", `attachment; filename="${filename}"`);
    }
  }

  /**
   * GET /overtime/units/summary/export?year=&month=&status=
   * Always per-unit, all units.
   */
  async exportUnitSummaryHandler(request, h) {
    this._validator.validateExportUnit(request.query);
    const { year, month, status } = request.query;
    const data = await this._service.getUnitSummary({ year, month, status });

    const headers = [
      "Nama_Unit",
      "Total_Karyawan",
      "Total_Jam_Lembur",
      "Total_Biaya_Lembur",
      "year",
      "month",
    ];
    const rows = (data.items || []).map((it) => ({
      Nama_Unit: it.unit_name || "",
      Total_Karyawan: it.users || 0,
      Total_Jam_Lembur: it.overtime_hours ?? 0,
      Total_Biaya_Lembur: it.overtime_amount ?? 0,
      year: data.year,
      month: data.month,
    }));
    const csv = toCsv(headers, rows);
    const filename = `overtime_units_${year}_${String(month).padStart(
      2,
      "0"
    )}.csv`;
    return h
      .response(csv)
      .type("text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`);
  }

  /**
   * GET /overtime/units/{unitId}/summary/export?year=&month=&status=
   * Exports the list of users inside one unit.
   */
  async exportUnitDetailSummaryHandler(request, h) {
    this._validator.validateExportUnitDetail({
      params: request.params,
      query: request.query,
    });
    const { unitId } = request.params;
    const { year, month, status } = request.query;
    const data = await this._service.getUnitDetailSummary({
      unitId,
      year,
      month,
      status,
    });

    const headers = [
      "Nama_Unit",
      "Nama_Karyawan",
      "Rate_Per_Jam",
      "Total_Jam_Lembur",
      "Total_Biaya_Lembur",
      "year",
      "month",
    ];
    const rows = (data.items || []).map((it) => ({
      Nama_Unit: data.unit_name || "",
      Nama_Karyawan: it.fullname,
      Rate_Per_Jam: it.hourly_ot_rate ?? 0,
      Total_Jam_Lembur: it.overtime_hours ?? 0,
      Total_Biaya_Lembur: it.overtime_amount ?? 0,
      year: data.year,
      month: data.month,
    }));
    const csv = toCsv(headers, rows);
    const filename = `overtime_unit_${unitId}_${year}_${String(month).padStart(
      2,
      "0"
    )}.csv`;
    return h
      .response(csv)
      .type("text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`);
  }
}

module.exports = OvertimeHandler;
