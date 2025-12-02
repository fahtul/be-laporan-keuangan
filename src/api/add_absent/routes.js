const path = require("path");
const { fileMaxBytes } = require("../../utils/constant");
const fs = require("fs");
const { algorithm, key } = require("../../services/storage/StorageService");
const crypto = require("crypto");
const NotFoundError = require("../../exceptions/NotFoundError");

const routes = (handler) => [
  {
    method: "POST",
    path: "/addabsent",
    handler: handler.postAbsentHandler,
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
