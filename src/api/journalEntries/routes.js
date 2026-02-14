const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  // LIST (pagination + filters)
  {
    method: "GET",
    path: "/v1/journal-entries",
    handler: handler.list,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },

  // GET detail (include lines)
  {
    method: "GET",
    path: "/v1/journal-entries/{id}",
    handler: handler.getById,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },

  // CREATE draft
  {
    method: "POST",
    path: "/v1/journal-entries",
    handler: handler.create,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },

  // EDIT draft
  {
    method: "PUT",
    path: "/v1/journal-entries/{id}",
    handler: handler.update,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },

  // DELETE draft (soft delete)
  {
    method: "DELETE",
    path: "/v1/journal-entries/{id}",
    handler: handler.remove,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },

  // AMEND posted (reverse + corrected entry, both posted)
  {
    method: "POST",
    path: "/v1/journal-entries/{id}/amend",
    handler: handler.amend,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },

  // POST (idempotent; uses Idempotency-Key header)
  {
    method: "POST",
    path: "/v1/journal-entries/{id}/post",
    handler: handler.post,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },

  // REVERSE (create reversing entry)
  {
    method: "POST",
    path: "/v1/journal-entries/{id}/reverse",
    handler: handler.reverse,
    options: { pre: [requireRole(["admin", "accountant"])] },
  },
];
