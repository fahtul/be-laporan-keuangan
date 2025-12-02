// src/api/salaryRules/routes.js
const routes = (handler) => [
  {
    method: "GET",
    path: "/salary-rules",
    handler: (req, h) => handler.getAllSalaryRulesHandler(req, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/salary-rules",
    handler: (req, h) => handler.postSalaryRuleHandler(req, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/salary-rules/{id}",
    handler: (req, h) => handler.getSalaryRuleHandler(req, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/salary-rules/{id}",
    handler: (req, h) => handler.putSalaryRuleHandler(req, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/salary-rules/{id}",
    handler: (req, h) => handler.deleteSalaryRuleHandler(req, h),
    options: { auth: "jims_jwt" },
  },
];

module.exports = routes;
