// src/api/workSchedules/index.js
const WorkSchedulesHandler = require("./handler");
const routes = require("./routes");
const WorkSchedulesService = require("../../services/mssql/WorkSchedulesService");
const WorkSchedulesValidator = require("../../validator/workSchedules");

module.exports = {
  name: "workSchedules",
  version: "1.0.0",
  register: async (server, options) => {
    // 👇 Make sure these are real instances
    const service = new WorkSchedulesService();
    const validator = WorkSchedulesValidator;
    const handler = new WorkSchedulesHandler(service, validator);

    server.route(routes(handler));
  },
};
