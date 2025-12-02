const ExcelJS = require("exceljs");

class AttendanceReportsHandler {
  constructor(service) {
    this._service = service;
    this.getMonthlyReportHandler = this.getMonthlyReportHandler.bind(this);
  }

  async getMonthlyReportHandler(request, h) {
    try {
      // *** pull from query, not params ***
      const { userId, year, month } = request.query;

      console.log(
        `Executing monthly report for: userId=${userId}, year=${year}, month=${month}`
      );

      const report = await this._service.getUserMonthlyReport(
        userId,
        Number(year),
        Number(month)
      );

      return h.response({
        status: "success",
        data: { report },
      });
    } catch (err) {
      console.error("Error in getMonthlyReportHandler:", err);
      throw err; // or wrap in a ClientError
    }
  }

  // === New: Daily Team Attendance (dynamic schedule from schedule_categories) ===
  // inside AttendanceReportsHandler
  getDailyTeamAttendanceHandler = async (request, h) => {
    const leaderId = request.auth?.credentials?.id ?? null;
    const { date, onlyUserIds } = request.query;

    // normalize onlyUserIds
    let ids = [];
    if (Array.isArray(onlyUserIds))
      ids = onlyUserIds.filter(Boolean).map(String);
    else if (typeof onlyUserIds === "string" && onlyUserIds.trim()) {
      ids = onlyUserIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const rows = await this._service.getDailyTeamAttendance({
      leaderId, // <-- ensure we pass what you queried
      date,
      onlyUserIds: ids,
    });

    return h.response({
      status: "success",
      meta: { date, count: rows.length },
      data: rows,
    });
  };

  // JSON monthly report
  async getMonthlyReportHandler(request, h) {
    try {
      const { userId, year, month, status } = request.query;

      const payload = await this._service.getUserMonthlyReport(
        userId,
        Number(year),
        Number(month),
        status || null
      );

      return h.response({
        status: "success",
        data: payload, // { kpi, report }
      });
    } catch (err) {
      console.error("Error in getMonthlyReportHandler:", err);
      throw err;
    }
  }

  // Excel export (with Daily Summary + Details sheets)
  exportMonthlyReportHandler = async (request, h) => {
    try {
      const { userId, year, month, status } = request.query;

      const { kpi, report } = await this._service.getUserMonthlyReport(
        userId,
        Number(year),
        Number(month),
        status || null
      );

      // Build Daily Summary from service helper
      const dailySummary = this._service.buildDailySummary(report);

      // Build workbook
      const wb = new ExcelJS.Workbook();

      // Sheet 1: Daily Summary
      const sh1 = wb.addWorksheet("Daily Summary");
      sh1.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "OK", key: "OK", width: 8 },
        { header: "LATE", key: "LATE", width: 8 },
        { header: "EARLY", key: "EARLY", width: 8 },
        { header: "LATE & EARLY", key: "LATE & EARLY", width: 15 },
        { header: "ALPHA", key: "ALPHA", width: 8 },
        { header: "SICK", key: "SICK", width: 8 },
        { header: "TIME_OFF", key: "TIME_OFF", width: 12 },
      ];
      dailySummary.forEach((r) => sh1.addRow(r));
      sh1.getRow(1).font = { bold: true };

      // Sheet 2: KPI (high level)
      const shKpi = wb.addWorksheet("KPI");
      shKpi.columns = [
        { header: "Section", key: "section", width: 16 },
        { header: "Metric", key: "metric", width: 16 },
        { header: "Value", key: "value", width: 14 },
      ];
      const krows = [
        { section: "Present", metric: "Total", value: kpi.present.total },
        { section: "Present", metric: "On Time", value: kpi.present.on_time },
        { section: "Present", metric: "Late In", value: kpi.present.late_in },
        {
          section: "Present",
          metric: "Early Out",
          value: kpi.present.early_out,
        },
        {
          section: "Not Present",
          metric: "Total",
          value: kpi.not_present.total,
        },
        {
          section: "Not Present",
          metric: "No In",
          value: kpi.not_present.no_in,
        },
        {
          section: "Not Present",
          metric: "No Out",
          value: kpi.not_present.no_out,
        },
        { section: "Away", metric: "Total", value: kpi.away.total },
        { section: "Away", metric: "Time Off", value: kpi.away.time_off },
        { section: "Away", metric: "Day Off", value: kpi.away.day_off },
      ];
      krows.forEach((r) => shKpi.addRow(r));
      shKpi.getRow(1).font = { bold: true };

      // Sheet 3: Details
      const sh2 = wb.addWorksheet("Details");
      sh2.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "Shift", key: "shift_name", width: 14 },
        { header: "Scheduled In", key: "scheduled_in", width: 14 },
        { header: "Scheduled Out", key: "scheduled_out", width: 14 },
        { header: "Clock In", key: "clock_in", width: 20 },
        { header: "Clock Out", key: "clock_out", width: 20 },
        { header: "Attendance Code", key: "attendance_code", width: 18 },
        { header: "Time Off Codes", key: "time_off_codes", width: 22 },
        { header: "Overtime Hours", key: "overtime_hours", width: 16 },
        { header: "Status", key: "status_label", width: 16 },
      ];
      report.forEach((r) => sh2.addRow(r));
      sh2.getRow(1).font = { bold: true };

      const buf = await wb.xlsx.writeBuffer();
      const filename = `attendance_${userId}_${year}-${month}.xlsx`;

      return h
        .response(buf)
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`);
    } catch (err) {
      console.error("Error in exportMonthlyReportHandler:", err);
      throw err;
    }
  };

  exportAllMonthlyReportHandler = async (request, h) => {
    try {
      const { year, month } = request.query;

      const allReports = await this._service.getAllUsersMonthlyReport(
        Number(year),
        Number(month)
      );

      // Daily summary across all users
      const allRows = allReports.flatMap((u) =>
        u.report.map((r) => ({
          ...r,
          fullname: u.fullname,
          user_id: u.user_id,
        }))
      );
      const dailySummary = this._service.buildDailySummary(allRows);

      // Per-user summary
      const userSummary = this._service.buildUserSummary(allReports);

      const ExcelJS = require("exceljs");
      const wb = new ExcelJS.Workbook();

      // Sheet 1: Daily Summary
      const sh1 = wb.addWorksheet("Daily Summary");
      sh1.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "OK", key: "OK", width: 8 },
        { header: "LATE", key: "LATE", width: 8 },
        { header: "EARLY", key: "EARLY", width: 8 },
        { header: "LATE & EARLY", key: "LATE & EARLY", width: 15 },
        { header: "ALPHA", key: "ALPHA", width: 8 },
        { header: "SICK", key: "SICK", width: 8 },
        { header: "TIME_OFF", key: "TIME_OFF", width: 12 },
      ];
      dailySummary.forEach((r) => sh1.addRow(r));
      sh1.getRow(1).font = { bold: true };

      // Sheet 2: User Summary
      const sh2 = wb.addWorksheet("User Summary");
      sh2.columns = [
        { header: "User", key: "fullname", width: 22 },
        { header: "OK", key: "OK", width: 8 },
        { header: "LATE", key: "LATE", width: 8 },
        { header: "EARLY", key: "EARLY", width: 8 },
        { header: "LATE & EARLY", key: "LATE & EARLY", width: 15 },
        { header: "ALPHA", key: "ALPHA", width: 8 },
        { header: "SICK", key: "SICK", width: 8 },
        { header: "TIME_OFF", key: "TIME_OFF", width: 12 },
      ];
      userSummary.forEach((r) => sh2.addRow(r));
      sh2.getRow(1).font = { bold: true };

      // Sheet 3: Details
      const sh3 = wb.addWorksheet("Details");
      sh3.columns = [
        { header: "Date", key: "date", width: 12 },
        { header: "User", key: "fullname", width: 20 },
        { header: "Shift", key: "shift_name", width: 14 },
        { header: "Scheduled In", key: "scheduled_in", width: 14 },
        { header: "Scheduled Out", key: "scheduled_out", width: 14 },
        { header: "Clock In", key: "clock_in", width: 20 },
        { header: "Clock Out", key: "clock_out", width: 20 },
        { header: "Status", key: "status_label", width: 16 },
      ];
      allRows.forEach((r) => sh3.addRow(r));
      sh3.getRow(1).font = { bold: true };

      const buf = await wb.xlsx.writeBuffer();
      const filename = `attendance_all_${year}-${month}.xlsx`;

      return h
        .response(buf)
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", `attachment; filename="${filename}"`);
    } catch (err) {
      console.error("Error in exportAllMonthlyReportHandler:", err);
      throw err;
    }
  };
}

module.exports = AttendanceReportsHandler;
