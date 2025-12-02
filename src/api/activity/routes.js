const routes = (handler) => [
  {
    method: "POST",
    path: "/activities",
    handler: handler.postActivityHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/activities",
    handler: handler.getActivitiesHandler, // supports filters
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/activities/{id}",
    handler: handler.getActivityByIdHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "PUT",
    path: "/activities/{id}",
    handler: handler.putActivityByIdHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "DELETE",
    path: "/activities/{id}",
    handler: handler.deleteActivityByIdHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
