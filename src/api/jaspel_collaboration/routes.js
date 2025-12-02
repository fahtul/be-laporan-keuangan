const path = require("path");

const routes = (handler) => [
  {
    method: "POST",
    path: "/jaspel/collaborations",
    handler: handler.postJaspelCollaborationHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
