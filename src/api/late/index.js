const LateHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "lateSummary",
  version: "1.0.0",
  register: async (server, { service, validator }) => {
    const handler = new LateHandler(service, validator);
    server.route(routes(handler));
  },
};
