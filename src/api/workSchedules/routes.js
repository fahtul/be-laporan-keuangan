const routes = (handler) => [
  {
    method: "GET",
    path: "/work-schedules",
    handler: (r, h) => handler.getAllWorkSchedulesHandler(r, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/work-schedules",
    handler: (r, h) => handler.postWorkScheduleHandler(r, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/work-schedules/{id}",
    handler: (r, h) => handler.getWorkScheduleHandler(r, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/work-schedules/{id}",
    handler: (r, h) => handler.putWorkScheduleHandler(r, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/work-schedules/{id}",
    handler: (r, h) => handler.deleteWorkScheduleHandler(r, h),
    options: { auth: "jims_jwt" },
  },

  // overrides per month
  {
    method: "GET",
    path: "/work-schedules/{id}/overrides",
    handler: (r, h) => handler.getOverridesHandler(r, h),
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/work-schedules/{id}/overrides",
    handler: (r, h) => handler.createOverrideHandler(r, h),
    options: { auth: "jims_jwt" },
  },

  // **batch** per‐date overrides in one call
  {
    method: "POST",
    path: "/work-schedules/{id}/overrides/batch",
    handler: (r, h) => handler.batchOverridesHandler(r, h),
    options: { auth: "jims_jwt" },
  },
];

module.exports = routes;
