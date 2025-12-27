const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/equity-statement",
    handler: handler.get,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

