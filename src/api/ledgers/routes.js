const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/ledgers",
    handler: handler.getLedger,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];
