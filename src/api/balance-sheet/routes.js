const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/balance-sheet",
    handler: handler.getBalanceSheet,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

