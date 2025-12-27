const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/cash-flow",
    handler: handler.getCashFlow,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

