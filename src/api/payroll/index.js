// src/api/payroll/index.js
const PayrollHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "payroll",
  version: "1.0.0",
  register: async (server, { service }) => {
    const handler = new PayrollHandler(service);
    server.route(routes(handler));
  },
};
