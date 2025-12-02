const fs = require("fs");
const path = require("path");
const { imageMaxBytes } = require("../../utils/constant");
const NotFoundError = require("../../exceptions/NotFoundError");

const REPORT_STORAGE_PATH = path.resolve(
  __dirname,
  process.env.REPORT_READ_STORAGE_PATH
);
const routes = (handler) => [
  {
    method: "POST",
    path: "/report",
    handler: handler.postReportWithFileHandler,
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: imageMaxBytes,
      },
    },
  },
  {
    method: "GET",
    path: "/report",
    handler: (request, h) => handler.getReportsByRoleHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/report/image/{param*}",
    handler: handleImageRequest,
    options: {
      // auth: "jims_jwt", // Assuming the same JWT auth applies
    },
  },
  {
    method: "PUT",
    path: "/report/{id}",
    handler: (request, h) => handler.updateReportHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "PUT",
    path: "/report/pic/progress/{id}",
    handler: (request, h) => handler.updateReportProgressPICHandler(request, h),
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: imageMaxBytes,
      },
    },
  },
  {
    method: "PUT",
    path: "/report/pic/done/{id}",
    handler: (request, h) => handler.updateReportDonePICHandler(request, h),
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: imageMaxBytes,
      },
    },
  },
  
];

const handleImageRequest = async (request, h) => {
  const fileName = request.params.param;
  const filePath = path.join(REPORT_STORAGE_PATH, fileName);

  // Check if the file is within the allowed directory
  if (!isPathWithinDirectory(REPORT_STORAGE_PATH, filePath)) {
    return h.response("Access denied").code(403);
  }

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError("Image file not found");
  }

  // Read the image file
  const fileStream = fs.createReadStream(filePath);

  // Serve the image file directly
  return h
    .response(fileStream)
    .header("Content-Disposition", `inline; filename="${fileName}"`)
    .type("image/jpeg"); // Adjust the MIME type based on the actual image type (e.g., "image/png")
};

const isPathWithinDirectory = (parentDir, filePath) => {
  const relative = path.relative(parentDir, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

module.exports = routes;
