const path = require("path");

const routes = (handler) => [
  {
    method: "POST",
    path: "/nilai/collaborations",
    handler: handler.postNilaiCollaborationHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
