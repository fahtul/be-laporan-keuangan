const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/trial-balance",
    handler: handler.getTrialBalance,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

