const KpiHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "kpis",
  version: "1.0.0",
  register: async (
    server,
    {
      kpiService,
      storageService,
      unitService,
      divisionService,
      usersService,
      kpiCollaborationService,
      validator,
    }
  ) => {
    const kpiHandler = new KpiHandler(
      kpiService,
      storageService,
      unitService,
      divisionService,
      usersService,
      kpiCollaborationService,
      validator
    );
    server.route(routes(kpiHandler));
  },
};
