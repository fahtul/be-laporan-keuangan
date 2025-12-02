// src/api/presence/routes.js
module.exports = (handler) => [
  {
    method: "GET",
    path: "/presence/summary",
    handler: handler.getMonthlySummaryHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/presence/users/{userId}/detail",
    handler: handler.getUserDetailHandler,
    options: { auth: "jims_jwt" },
  },
];
