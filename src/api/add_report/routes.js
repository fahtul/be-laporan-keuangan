const path = require("path");
const { fileMaxBytes } = require("../../utils/constant");
const fs = require("fs");
const { algorithm, key } = require("../../services/storage/StorageService");
const crypto = require("crypto");
const mime = require("mime-types");
const NotFoundError = require("../../exceptions/NotFoundError");

// Tentukan path untuk penyimpanan file AddReport
const ADD_REPORT_STORAGE_PATH = path.resolve(
  __dirname,
  process.env.ADD_REPORT_READ_STORAGE_PATH
);

// Function to check if a path is within the allowed directory
const isPathWithinDirectory = (parentDir, filePath) => {
  const relative = path.relative(parentDir, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

// Function to read and decrypt a file
const readFile = (filePath) => {
  const ivFilePath = `${filePath}.iv`;

  if (!fs.existsSync(ivFilePath)) {
    throw new NotFoundError("File not found");
  }

  const iv = fs.readFileSync(ivFilePath);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const readStream = fs.createReadStream(filePath);
  return readStream.pipe(decipher);
};

// Sanitize file path
const sanitizePath = (param, storagePath) => {
  return path.resolve(storagePath, param);
};

// Server route handler
// Server route handler
const handleFileRequest = async (request, h) => {
  const fileName = request.params.param;
  const filePath = path.join(ADD_REPORT_STORAGE_PATH, fileName);

  if (!isPathWithinDirectory(ADD_REPORT_STORAGE_PATH, filePath)) {
    return new AuthorizationError("Access denied").code(403);
  }

  if (!fs.existsSync(filePath)) {
    throw new NotFoundError("File not found");
  }

  // Get the MIME type from the file extension
  const fileType = mime.lookup(filePath); // Returns MIME type like 'application/pdf' or null if not found

  if (!fileType) {
    throw new NotFoundError("File type not supported");
  }

  // Read the encrypted file and decrypt it
  const decryptedStream = readFile(filePath);

  // Stream the decrypted content with the detected MIME type
  return h
    .response(decryptedStream)
    .header(
      "Content-Disposition",
      `attachment; filename="${request.params.param}"`
    )
    .type(fileType); // Use the detected MIME type
};

const routes = (handler) => [
  {
    method: "POST",
    path: "/addreports",
    handler: handler.postReportWithFileHandler,
    options: {
      auth: "jims_jwt", // Sesuaikan strategi autentikasi Anda
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: fileMaxBytes, // Batas ukuran file
      },
    },
  },
  {
    method: "GET",
    path: "/addreports/{param*}",
    handler: handleFileRequest,
    options: {
      auth: "jims_jwt", // Sesuaikan strategi autentikasi Anda
    },
  },
  {
    method: "GET",
    path: "/addreports",
    handler: (request, h) => handler.getReportsHandler(request, h),
    options: {
      auth: "jims_jwt", // Sesuaikan strategi autentikasi Anda
    },
  },
  {
    method: "DELETE",
    path: "/addreports/{reportId}",
    handler: handler.deleteReportHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        params: handler._validator.validateDeleteParams,
      },
    },
  },
];

module.exports = routes;
