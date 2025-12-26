const TrialBalanceHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "trial_balance",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new TrialBalanceHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};

