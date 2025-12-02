// src/api/attendance/index.js
const AttendanceService = require("../../services/mssql/AttendanceService");
const UsersService = require("../../services/mssql/UsersService");
const AttendanceValidator = require("../../validator/attendance");
const AttendanceHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "attendance",
  version: "1.0.0",
  register: async (server) => {
    const service = new AttendanceService();
    const usersService = new UsersService(); // Assuming usersService is registered in server.app
    const validator = AttendanceValidator;
    const handler = new AttendanceHandler(service, usersService, validator);

    server.route(routes(handler));
  },
};
