const UnitHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "units",
  version: "1.0.0",
  register: async (server, { service, usersService, validator }) => {
    const unitHandler = new UnitHandler(service, usersService, validator);
    server.route(routes(unitHandler));
  },
};
