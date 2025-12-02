const DocumentCollaborationHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "documentsCollaboration",
  version: "1.0.0",
  register: async (
    server,
    {
      documentService,
      documentCollaborationService,
      userService,
      divisionService,
      unitService,
      validator,
    }
  ) => {
    const documentCollaborationHandler = new DocumentCollaborationHandler(
      documentService,
      documentCollaborationService,
      userService,
      divisionService,
      unitService,
      validator
    );
    server.route(routes(documentCollaborationHandler));
  },
};
