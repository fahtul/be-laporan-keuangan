const routes = (handler) => [
  {
    method: "POST",
    path: "/users",
    handler: (request, h) => handler.postUserHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "PUT",
    path: "/users/{id}",
    handler: (request, h) => handler.updateUserHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "PUT",
    path: "/users/password",
    handler: (request, h) => handler.updateUserPasswordHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/users/{id}",
    handler: (request, h) => handler.getUserByIdHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/users",
    handler: (request, h) => handler.getUsers(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "DELETE",
    path: "/users/{id}",
    handler: (request, h) => handler.deleteUserByIdHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  // ✅ NEW: Import user salary
  {
    method: "POST",
    path: "/users/salary/import",
    handler: (request, h) => handler.importUserSalaryHandler(request, h),
    options: {
      auth: "jims_jwt",
      payload: {
        output: "stream",
        parse: true,
        allow: "multipart/form-data",
        multipart: true,
        maxBytes: 10485760,
      },
    },
  },
  // ✅ NEW: Export user data to Excel
  {
    method: "GET",
    path: "/users/export-excel",
    handler: (request, h) => handler.exportUsersExcelHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  
];

module.exports = routes;
