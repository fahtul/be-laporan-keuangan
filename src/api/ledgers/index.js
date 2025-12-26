const LedgersHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "ledgers",
  version: "1.0.0",
  register: async (server, { service, validator }) => {
    const handler = new LedgersHandler(service, validator);
    server.route(routes(handler));
  },
};
