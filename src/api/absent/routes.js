const routes = (handler) => [
  {
    method: "POST",
    path: "/absents",
    handler: handler.postAbsentHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/absents",
    handler: handler.getAbsentsHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/absents/{id}",
    handler: handler.getAbsentByIdHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "PUT",
    path: "/absents/{id}",
    handler: handler.putAbsentByIdHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "DELETE",
    path: "/absents/{id}",
    handler: handler.deleteAbsentByIdHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
