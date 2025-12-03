const Path = require("path");
const routes = (handler) => [
  {
    method: "POST",
    path: "/requests",
    handler: handler.postRequestHandler,
    options: {
      auth: "jims_jwt",
      payload: {
        // Allow multipart/form-data so Hapi will accept file uploads
        allow: "multipart/form-data",
        multipart: true,

        // Return file fields as streams
        output: "stream",

        // Automatically parse all fields into request.payload
        parse: true,

        // Maximum total payload size (including all files + fields)
        // Here: 10 MB = 10 * 1024 * 1024 bytes
        maxBytes: 10 * 1024 * 1024,
      },
    },
  },
  {
    method: "GET",
    path: "/requests",
    handler: handler.getRequestsHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/requests/{id}",
    handler: handler.getRequestByIdHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/requests/{id}",
    handler: handler.putRequestHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/requests/{id}/approve",
    handler: handler.putApprovalHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/requests/pending",
    handler: handler.getPendingApprovalsHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/secure-requests/uploads/{filename}",
    handler: {
      directory: {
        // Asumsikan folder 'uploads' ada di level src/../uploads
        path: Path.resolve(__dirname, "../../../requests"),
        redirectToSlash: false,
        index: false,
      },
    },
    options: {
      auth: "jims_jwt",
      cache: {
        privacy: "private",
        expiresIn: 30 * 60 * 1000, // cache 30 menit, misalnya
      },
      // Kita tidak perlu payload apapun di sini, cuma GET
    },
  },
  {
    method: "GET",
    path: "/requests/all",
    handler: handler.listAll,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/requests/{id}/detail",
    handler: handler.getOne,
    options: { auth: "jims_jwt" },
  },

  {
    method: "PATCH",
    path: "/requests/{id}/status",
    handler: handler.setStatus,
    options: { auth: "jims_jwt" },
  },

  {
    method: "DELETE",
    path: "/requests/{id}",
    handler: handler.deleteRequestHandler,
    options: { auth: "jims_jwt" },
  },
];

module.exports = routes;
