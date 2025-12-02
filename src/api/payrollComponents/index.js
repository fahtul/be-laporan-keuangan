// src/api/payrollComponents/index.js
const PayrollComponentsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "payrollComponents",
  version: "1.0.0",
  register: async (server, { service, validator }) => {
    const handler = new PayrollComponentsHandler(service, validator);
    server.route(routes(handler));
  },
};
