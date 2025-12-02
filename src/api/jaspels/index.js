const JaspelHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "jaspels",
  version: "1.0.0",
  register: async (
    server,
    {
      jaspelService,
      storageService,
      unitService,
      divisionService,
      usersService,
      jaspelCollaborationService,
      validator,
    }
  ) => {
    const jaspelHandler = new JaspelHandler(
      jaspelService,
      storageService,
      unitService,
      divisionService,
      usersService,
      jaspelCollaborationService,
      validator
    );
    server.route(routes(jaspelHandler));
  },
};
