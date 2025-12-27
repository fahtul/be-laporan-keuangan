const EquityStatementHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "equity_statement",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new EquityStatementHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

