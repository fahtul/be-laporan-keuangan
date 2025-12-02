const NilaiCollaborationHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "nilaisCollaboration",
  version: "1.0.0",
  register: async (
    server,
    {
      nilaiService,
      nilaiCollaborationService,
      userService,
      divisionService,
      unitService,
      validator,
    }
  ) => {
    const nilaiCollaborationHandler = new NilaiCollaborationHandler(
      nilaiService,
      nilaiCollaborationService,
      userService,
      divisionService,
      unitService,
      validator
    );
    server.route(routes(nilaiCollaborationHandler));
  },
};
