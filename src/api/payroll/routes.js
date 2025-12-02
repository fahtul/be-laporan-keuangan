const routes = (handler) => [
  {
    method: "GET",
    path: "/payroll",
    handler: (req, h) => handler.getPayrollHandler(req, h),
    options: { auth: "jims_jwt" },
  },
];

module.exports = routes;
