const path = require("path");

const routes = (handler) => [
  {
    method: "POST",
    path: "/kpi/collaborations",
    handler: handler.postKpiCollaborationHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
