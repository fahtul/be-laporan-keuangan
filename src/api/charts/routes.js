const requireRole = require("../../middlewares/requireRole");

module.exports = (handler) => [
  {
    method: "GET",
    path: "/v1/charts/income-statement",
    handler: handler.getIncomeStatementChart,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/charts/balance-sheet",
    handler: handler.getBalanceSheetChart,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/charts/equity-statement",
    handler: handler.getEquityStatementChart,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/charts/cash-flow",
    handler: handler.getCashFlowChart,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
  {
    method: "GET",
    path: "/v1/charts/financials",
    handler: handler.getFinancialCharts,
    options: { pre: [requireRole(["admin", "accountant", "viewer"])] },
  },
];

