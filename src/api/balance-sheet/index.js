const BalanceSheetHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "balance_sheet",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new BalanceSheetHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

