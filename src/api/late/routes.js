module.exports = (handler) => [
  {
    method: "GET",
    path: "/late/summary",
    handler: handler.getMonthlyLateSummaryHandler,
    options: { auth: "jims_jwt" },
  },
];
