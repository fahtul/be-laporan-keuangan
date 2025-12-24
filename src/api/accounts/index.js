const AccountsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "accounts",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new AccountsHandler(service, validator, auditLogService);
    server.route(routes(handler));
  },
};
