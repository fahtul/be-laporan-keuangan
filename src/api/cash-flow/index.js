const CashFlowHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "cash_flow",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new CashFlowHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

