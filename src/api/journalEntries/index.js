const JournalEntriesHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "journalEntries",
  version: "1.0.0",
  register: async (server, { service, validator, auditLogService }) => {
    const handler = new JournalEntriesHandler(
      service,
      validator,
      auditLogService
    );
    server.route(routes(handler));
  },
};
