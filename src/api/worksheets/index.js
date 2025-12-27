const WorksheetsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "worksheets",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new WorksheetsHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

