const DivisionHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "divisions",
  version: "1.0.0",
  register: async (server, { service, usersService, validator }) => {
    const divisionHandler = new DivisionHandler(
      service,
      usersService,
      validator
    );
    server.route(routes(divisionHandler));
  },
};
