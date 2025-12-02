// api/salary/index.js
const SalaryHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "salary",
  version: "1.0.0",
  register: async (
    server,
    { service: salaryService, validator: salaryValidator }
  ) => {
    const handler = new SalaryHandler(salaryService, salaryValidator);
    server.route(routes(handler));
  },
};
