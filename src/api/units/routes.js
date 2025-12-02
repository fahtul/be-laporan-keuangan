const routes = (handler) => [
  {
    method: "POST",
    path: "/units",
    handler: handler.postUnitHandler,
     options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/units",
    handler: handler.getUnitsHandler,
     options: {
      auth: "jims_jwt",
    },
  },
  
];

module.exports = routes;
