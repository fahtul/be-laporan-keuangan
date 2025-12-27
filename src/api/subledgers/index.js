const SubledgersHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "subledgers",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new SubledgersHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

