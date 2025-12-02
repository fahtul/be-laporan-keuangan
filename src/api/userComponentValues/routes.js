const routes = (handler) => [
  {
    method: "POST",
    path: "/user-component-values",
    handler: handler.postUpsertHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/user-component-values",
    handler: handler.getListHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/user-component-values/{id}",
    handler: handler.getByIdHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/user-component-values/{id}",
    handler: handler.deleteHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/user-component-values/import/csv",
    handler: handler.importCsvHandler,
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        parse: true,
        maxBytes: 5 * 1024 * 1024,
      },
    },
  },

  // Excel
  {
    method: "GET",
    path: "/user-component-values/export/excel",
    handler: handler.exportExcelHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/user-component-values/import/excel",
    handler: handler.importExcelHandler,
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        parse: true,
        maxBytes: 10 * 1024 * 1024,
      },
    },
  },
  {
    method: "POST",
    path: "/user-components/bulk",
    handler: handler.postBulkUpsertHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        payload: handler.validateBulkUpsert, // optional—Hapi can auto-validate
        failAction: (request, h, err) => {
          throw err;
        },
      },
    },
  },
];

module.exports = routes;
