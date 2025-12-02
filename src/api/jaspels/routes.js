const path = require("path");
const createFileUtils = require("../../utils/fileUtils");
const {fileMaxBytes} = require("../../utils/constant");

const JASPEL_STORAGE_PATH = path.resolve(
  __dirname,
  process.env.JASPEL_READ_STORAGE_PATH
);

const fileUtils = createFileUtils(JASPEL_STORAGE_PATH);

const routes = (handler) => [
  {
    method: "POST",
    path: "/jaspel",
    handler: handler.postJaspelWithFileHandler,
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
    path: "/jaspel/{param*}",
    handler: fileUtils.handleFileRequest,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/jaspel",
    handler: (request, h) => handler.getJaspelHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
