// api/salary/routes.js
const routes = (handler) => [
  {
    method: "POST",
    path: "/salary/run",
    handler: handler.postRunSalaryHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/salary/history",
    handler: handler.getSalaryHistoryHandler,
    options: { auth: "jims_jwt" },
  },
  // new: run for all users
  {
    method: "POST",
    path: "/salary/run/all",
    handler: handler.postRunSalaryForAllHandler,
    options: { auth: "jims_jwt" },
  },
  // new: history for all users
  {
    method: "GET",
    path: "/salary/history/all",
    handler: handler.getAllSalaryHistoryHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/salary/export-daily-summary",
    handler: handler.exportDailySummary,
    options: {
      description: "Export daily overtime and absence summary",
      notes: "Generates an Excel file grouped by date",
      tags: ["api", "salary"],
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
