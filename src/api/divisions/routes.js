const routes = (handler) => [
  {
    method: "POST",
    path: "/divisions",
    handler: handler.postDivisionHandler,
    options: {
      auth: 'jims_jwt'
    },
  },
  {
    method: "GET",
    path: "/divisions",
    handler: handler.getDivisionsHandler,
    options: {
      auth: 'jims_jwt'
    },
  },
  
];

module.exports = routes;
