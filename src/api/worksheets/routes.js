const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/worksheets",
    handler: handler.get,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

