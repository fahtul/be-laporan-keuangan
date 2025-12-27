const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/closings/year-end",
    handler: handler.getYearEndStatus,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "POST",
    path: "/v1/closings/year-end",
    handler: handler.postYearEndClosing,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
];

