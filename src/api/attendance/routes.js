// src/api/attendance/routes.js
const routes = (handler) => [
  {
    method: "POST",
    path: "/attendance/checkin",
    options: {
      auth: "jims_jwt",
      payload: {
        maxBytes: 5 * 1024 * 1024, // 5 MB limit
        parse: true,
        multipart: true,
        output: "stream", // give us a Readable stream
        allow: "multipart/form-data",
      },
    },
    handler: (request, h) => handler.postCheckinHandler(request, h),
  },
  {
    method: "POST",
    path: "/attendance/checkout",
    options: {
      auth: "jims_jwt",
      payload: {
        maxBytes: 5 * 1024 * 1024,
        parse: true,
        multipart: true,
        output: "stream",
        allow: "multipart/form-data",
      },
    },
    handler: (request, h) => handler.postCheckoutHandler(request, h),
  },

  {
    method: "GET",
    path: "/attendance/history",
    handler: (request, h) => handler.getHistoryHandler(request, h),
    options: { auth: "jims_jwt" },
  },

  {
    method: "GET",
    path: "/attendance/payroll",
    handler: (request, h) => handler.getPayrollHandler(request, h),
    options: {
      auth: "jims_jwt",
      description: "Hitung payroll (telat & cepat pulang)",
    },
  },

  {
    method: "GET",
    path: "/attendances",
    handler: (req, h) => handler.getAllAttendanceHandler(req, h),
    options: { auth: "jims_jwt" },
  },

  // ─── Export Attendance for a Specific User ─────────────────────────────────
  {
    method: "GET",
    path: "/attendance/export-user",
    handler: (request, h) => handler.exportUserAttendanceHandler(request, h),
    options: { auth: "jims_jwt" },
  },

  // ─── Export Attendance for All Users ───────────────────────────────────────
  {
    method: "GET",
    path: "/attendance/export-all-users",
    handler: (request, h) =>
      handler.exportAllUsersAttendanceHandler(request, h),
    options: { auth: "jims_jwt" },
  },

  // Add the route for exporting all users' attendance to Excel
  {
    method: "GET",
    path: "/attendance/export-all-users-excel",
    handler: (request, h) => handler.exportAllUsersAttendanceExcel(request, h),
    options: { auth: "jims_jwt" }, // Use authentication if needed
  },
  {
    method: "PUT",
    path: "/attendance/manual",
    options: { auth: "jims_jwt" },
    handler: (request, h) => handler.updateTimesHandler(request, h),
  },
];

module.exports = routes;
