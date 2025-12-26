const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/opening-balances",
    handler: handler.getByKey,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "POST",
    path: "/v1/opening-balances",
    handler: handler.create,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
];
