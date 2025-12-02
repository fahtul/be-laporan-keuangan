const UserHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "users",
  version: "1.0.0",
  register: async (server, { service, unitsService, validator }) => {
    const userHandler = new UserHandler(service, unitsService, validator);
    server.route(routes(userHandler));
  },
};
