const routes = (handler) => [
  {
    method: "POST",
    path: "/face",
    handler: handler.postFaceHandler,
    options: {
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: 5 * 1024 * 1024, // 5 MB
      },
      auth: "jims_jwt",
    },
  },
  {
    method: "PUT",
    path: "/face",
    handler: handler.putFaceHandler,
    options: {
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: 5 * 1024 * 1024,
      },
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/face/{userId}",
    handler: handler.getFaceHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "DELETE",
    path: "/face/{userId}",
    handler: handler.deleteFaceHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/secure-faces/{filename}",
    handler: handler.getSecureFaceImageHandler,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/face/{userId}/status",
    handler: handler.checkFaceStatusHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
