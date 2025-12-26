const BusinessPartnersHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "business_partners",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new BusinessPartnersHandler(
      service,
      validator,
      auditLogService
    );
    server.route(routes(handler));
  },
};
