const path = require("path");
const createFileUtils = require("../../utils/fileUtils");
const { fileMaxBytes } = require("../../utils/constant");

const NILAI_STORAGE_PATH = path.resolve(
  __dirname,
  process.env.NILAI_READ_STORAGE_PATH
);

const fileUtils = createFileUtils(NILAI_STORAGE_PATH);

const routes = (handler) => [
  {
    method: "POST",
    path: "/nilai",
    handler: handler.postNilaiWithFileHandler,
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: fileMaxBytes,
      },
    },
  },
  {
    method: "GET",
    path: "/nilai/{param*}",
    handler: fileUtils.handleFileRequest,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/nilai",
    handler: (request, h) => handler.getNilaiHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
