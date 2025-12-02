const path = require("path");

const routes = (handler) => [
  {
    method: "POST",
    path: "/jobdesk/collaborations",
    handler: handler.postJobdeskCollaborationHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  // {
  //   method: "DELETE",
  //   path: "jobdesk/collaborations",
  //   handler: handler.deleteJobdeskCollaborationHandler,
  //   options: {
  //     auth: "jims_jwt",
  //   },
  // },
];

module.exports = routes;
