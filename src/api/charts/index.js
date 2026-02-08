const ChartsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "charts",
  version: "1.0.0",
  register: async (server, { service, validator }) => {
    const handler = new ChartsHandler(service, validator);
    server.route(routes(handler));
  },
};
