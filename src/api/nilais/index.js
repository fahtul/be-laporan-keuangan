const NilaiHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "nilais",
  version: "1.0.0",
  register: async (
    server,
    {
      nilaiService,
      storageService,
      unitService,
      divisionService,
      usersService,
      nilaiCollaborationService,
      validator,
    }
  ) => {
    const nilaiHandler = new NilaiHandler(
      nilaiService,
      storageService,
      unitService,
      divisionService,
      usersService,
      nilaiCollaborationService,
      validator
    );
    server.route(routes(nilaiHandler));
  },
};
