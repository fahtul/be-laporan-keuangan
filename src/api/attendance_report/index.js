// src/api/attendance/index.js
const AttendanceReportService = require("../../services/mssql/AttendanceReportService");
const AttendanceReportHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "attendance_report",
  version: "1.0.0",
  register: async (server, { service }) => {
    const attendanceSusulanHandler = new AttendanceReportHandler(service);
    server.route(routes(attendanceSusulanHandler));
  },
};
