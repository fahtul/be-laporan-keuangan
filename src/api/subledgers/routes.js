const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/subledgers",
    handler: handler.listByBpSummary,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/subledgers/{bpId}",
    handler: handler.getBpDetail,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

