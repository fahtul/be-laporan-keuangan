const JaspelCollaborationHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "jaspelsCollaboration",
  version: "1.0.0",
  register: async (
    server,
    {
      jaspelService,
      jaspelCollaborationService,
      userService,
      divisionService,
      unitService,
      validator,
    }
  ) => {
    const jaspelCollaborationHandler = new JaspelCollaborationHandler(
      jaspelService,
      jaspelCollaborationService,
      userService,
      divisionService,
      unitService,
      validator
    );
    server.route(routes(jaspelCollaborationHandler));
  },
};
