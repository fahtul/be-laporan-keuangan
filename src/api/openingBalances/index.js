const OpeningBalancesHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "opening_balances",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new OpeningBalancesHandler(
      service,
      validator,
      auditLogService
    );
    server.route(routes(handler));
  },
};
