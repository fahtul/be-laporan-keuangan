const routes = (handler) => [
  {
    method: "POST",
    path: "/leaves",
    handler: handler.postLeaveHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/leaves",
    handler: handler.getLeavesHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/leaves/{id}",
    handler: handler.getLeaveByIdHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/leaves/{id}/approve/{level}",
    handler: handler.putApproveHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/leaves/{id}/reject/{level}",
    handler: handler.putRejectHandler,
    options: { auth: "jims_jwt" },
  },
];

module.exports = routes;
