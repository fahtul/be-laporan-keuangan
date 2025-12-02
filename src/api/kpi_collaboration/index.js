const KpiCollaborationHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "kpisCollaboration",
  version: "1.0.0",
  register: async (
    server,
    {
      kpiService,
      kpiCollaborationService,
      userService,
      divisionService,
      unitService,
      validator,
    }
  ) => {
    const kpiCollaborationHandler = new KpiCollaborationHandler(
      kpiService,
      kpiCollaborationService,
      userService,
      divisionService,
      unitService,
      validator
    );
    server.route(routes(kpiCollaborationHandler));
  },
};
