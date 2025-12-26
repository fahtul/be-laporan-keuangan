const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/income-statement",
    handler: handler.getIncomeStatement,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

