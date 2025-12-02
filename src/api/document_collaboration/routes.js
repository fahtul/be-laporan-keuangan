const path = require("path");

const routes = (handler) => [
  {
    method: "POST",
    path: "/document/collaborations",
    handler: handler.postDocumentCollaborationHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  // {
  //   method: "DELETE",
  //   path: "document/collaborations",
  //   handler: handler.deleteDocumentCollaborationHandler,
  //   options: {
  //     auth: "jims_jwt",
  //   },
  // },
];

module.exports = routes;
