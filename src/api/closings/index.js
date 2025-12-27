const ClosingsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "closings",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new ClosingsHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

