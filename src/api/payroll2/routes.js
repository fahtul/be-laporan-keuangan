// src/api/payroll2/routes.js
const routes = (handler) => [
  // ===== GENERATE =====
  {
    method: "POST",
    path: "/payroll/generate/user",
    handler: handler.generateForUser,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/payroll/generate/all",
    handler: handler.generateForAll,
    // long running — disable per-route timeouts to avoid cURL 28
    options: { auth: "jims_jwt", timeout: { server: false, socket: false } },
  },

  // ===== LIST & DETAIL =====
  {
    method: "GET",
    path: "/payroll/records",
    handler: handler.listRecords,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/payroll/records/{id}",
    handler: handler.getRecord,
    options: { auth: "jims_jwt" },
  },

  {
    method: "GET",
    path: "/payroll/recordsUser",
    handler: handler.getRecordOnlyUser,
    options: { auth: "jims_jwt" },
  },

  // ===== ITEMS (edit line items) =====
  {
    method: "POST",
    path: "/payroll/records/{id}/items",
    handler: handler.addItem,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/payroll/records/{id}/items/{itemId}",
    handler: handler.updateItem,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/payroll/records/{id}/items/{itemId}",
    handler: handler.deleteItem,
    options: { auth: "jims_jwt" },
  },

  // ===== RECALC & STATUS =====
  {
    method: "POST",
    path: "/payroll/records/{id}/recalc",
    handler: handler.recalc,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/payroll/records/{id}/status",
    handler: handler.setStatus,
    options: { auth: "jims_jwt" },
  },

  // ===== EXCEL EXPORTS =====
  {
    method: "GET",
    path: "/payroll/export/record/{id}",
    handler: handler.exportRecord,
    options: {
      auth: "jims_jwt",
      timeout: { server: false, socket: false }, // big files
    },
  },
  {
    method: "GET",
    path: "/payroll/export/period",
    handler: handler.exportPeriod, // ?year=YYYY&month=MM
    options: {
      auth: "jims_jwt",
      timeout: { server: false, socket: false },
    },
  },

  // --- Delete one day (by date embedded in code) ---
  {
    method: "DELETE",
    path: "/payroll/records/{id}/deductions/late/{date}",
    handler: handler.deleteLateForDate,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/payroll/records/{id}/deductions/early/{date}",
    handler: handler.deleteEarlyForDate,
    options: { auth: "jims_jwt" },
  },

  // --- Delete all in the record ---
  {
    method: "DELETE",
    path: "/payroll/records/{id}/deductions/late",
    handler: handler.deleteAllLate,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/payroll/records/{id}/deductions/early",
    handler: handler.deleteAllEarly,
    options: { auth: "jims_jwt" },
  },
];

module.exports = routes;
