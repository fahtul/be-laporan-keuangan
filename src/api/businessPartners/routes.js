const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/business-partners",
    handler: handler.list,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/business-partners/options",
    handler: handler.options,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/business-partners/{id}",
    handler: handler.getById,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "POST",
    path: "/v1/business-partners",
    handler: handler.create,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
  {
    method: "POST",
    path: "/v1/business-partners/{id}/restore",
    handler: handler.restoreBusinessPartnerHandler,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
  {
    method: "PUT",
    path: "/v1/business-partners/{id}",
    handler: handler.update,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
  {
    method: "DELETE",
    path: "/v1/business-partners/{id}",
    handler: handler.remove,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
];
