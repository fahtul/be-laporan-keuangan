// src/api/payroll/index.js
const PayrollService2 = require("../../services/mssql/PayrollService2");
const UsersService = require("../../services/mssql/UsersService");
const UserService = require("../../services/mssql/UsersService");
const PayrollHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "payroll2",
  register: async (server, { validator }) => {
    const service = new PayrollService2();
    const usersService = new UsersService();
    const handler = new PayrollHandler(service, usersService);
    server.route(routes(handler));
  },
};
