const AbsentHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "absents",
  version: "1.0.0",
  register: async (server, { service, usersService, validator }) => {
    const absentHandler = new AbsentHandler(service, usersService, validator);
    server.route(routes(absentHandler));
  },
};
