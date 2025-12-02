const DocumentHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "documents",
  version: "1.0.0",
  register: async (
    server,
    {
      documentService,
      storageService,
      unitService,
      divisionService,
      usersService,
      documentCollaborationService,
      validator,
    }
  ) => {
    const documentHandler = new DocumentHandler(
      documentService,
      storageService,
      unitService,
      divisionService,
      usersService,
      documentCollaborationService,
      validator
    );
    server.route(routes(documentHandler));
  },
};
