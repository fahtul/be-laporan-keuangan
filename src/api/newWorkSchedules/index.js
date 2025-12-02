const WorkScheduleHandler = require("../../api/newWorkSchedules/handler");
const routes = require("../../api/newWorkSchedules/routes");

module.exports = {
  name: "newWorkSchedules",
  version: "1.0.0",
  register: async (server, { validator }) => {
    const WorkScheduleService = require("../../services/mssql/NewWorkScheduleService");
    const workScheduleService = new WorkScheduleService();

    const handler = new WorkScheduleHandler(workScheduleService, validator);
    server.route(routes(handler));
  },
};