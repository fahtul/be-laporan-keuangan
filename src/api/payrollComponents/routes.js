// src/api/payrollComponents/routes.js
const routes = (handler) => [
  {
    method: "POST",
    path: "/payroll/components",
    handler: handler.postComponentHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/payroll/components",
    handler: handler.getComponentsHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/payroll/components/{id}",
    handler: handler.getComponentByIdHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/payroll/components/{id}",
    handler: handler.putComponentHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/payroll/components/{id}",
    handler: handler.deleteComponentHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/payroll/components/import/csv",
    handler: handler.importCsvHandler,
    options: {
      auth: "jims_jwt",
      payload: { multipart: true, output: "stream", parse: true },
    },
  },
  // Excel export/import
  {
    method: "GET",
    path: "/payroll/components/export/excel",
    handler: handler.exportExcelHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/payroll/components/import/excel",
    handler: handler.importExcelHandler,
    options: {
      auth: "jims_jwt",
      payload: { multipart: true, output: "stream", parse: true },
    },
  },
];

module.exports = routes;
