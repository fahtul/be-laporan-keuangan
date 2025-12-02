module.exports = (handler) => [
  // GET /overtime/summary?year=2025&month=9&status=approved|locked|published
  {
    method: "GET",
    path: "/overtime/summary",
    handler: handler.getMonthlySummaryHandler,
    options: { auth: "jims_jwt" },
  },

  // GET /overtime/users/{userId}/detail?year=2025&month=9
  {
    method: "GET",
    path: "/overtime/users/{userId}/detail",
    handler: handler.getUserOvertimeDetailHandler,
    options: { auth: "jims_jwt" },
  },

  // (optional) GET /overtime/summary/by-month?year=2025
  // returns one row per (user, month) for the whole year
  {
    method: "GET",
    path: "/overtime/summary/by-month",
    handler: handler.getYearlyByMonthSummaryHandler,
    options: { auth: "jims_jwt" },
  },

  {
    // GET /overtime/units/summary?year=2025&month=9&status=approved
    method: "GET",
    path: "/overtime/units/summary",
    handler: handler.getUnitSummaryHandler,
    options: { auth: "jims_jwt" },
  },
  {
    // GET /overtime/units/{unitId}/summary?year=2025&month=9&status=approved
    method: "GET",
    path: "/overtime/units/{unitId}/summary",
    handler: handler.getUnitDetailSummaryHandler,
    options: { auth: "jims_jwt" },
  },

  // NEW: exports
  {
    method: "GET",
    path: "/overtime/summary/export",
    handler: handler.exportMonthlySummaryHandler,
    options: { auth: "jims_jwt" },
  }, // group=user|unit
  {
    method: "GET",
    path: "/overtime/units/summary/export",
    handler: handler.exportUnitSummaryHandler,
    options: { auth: "jims_jwt" },
  }, // all units
  {
    method: "GET",
    path: "/overtime/units/{unitId}/summary/export",
    handler: handler.exportUnitDetailSummaryHandler,
    options: { auth: "jims_jwt" },
  }, // one unit’s users
];
