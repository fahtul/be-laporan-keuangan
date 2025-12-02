const path = require("path");
const createFileUtils = require("../../utils/fileUtils");
const {fileMaxBytes} = require("../../utils/constant");

const KPI_STORAGE_PATH = path.resolve(
  __dirname,
  process.env.KPI_READ_STORAGE_PATH
);

const fileUtils = createFileUtils(KPI_STORAGE_PATH);

const routes = (handler) => [
  {
    method: "POST",
    path: "/kpi",
    handler: handler.postKpiWithFileHandler,
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
    path: "/kpi/{param*}",
    handler: fileUtils.handleFileRequest,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/kpi",
    handler: (request, h) => handler.getKpiHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
