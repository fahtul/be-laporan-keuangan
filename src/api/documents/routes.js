const path = require("path");
const { algorithm, key } = require("../../services/storage/StorageService");
const fs = require("fs");
const crypto = require("crypto");
const NotFoundError = require("../../exceptions/NotFoundError");
const AuthorizationError = require("../../exceptions/AuthorizationError");

const DOCUMENT_STORAGE_PATH = path.resolve(
  __dirname,
  process.env.DOCUMENT_READ_STORAGE_PATH
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
const handleFileRequest = async (request, h) => {
  const fileName = request.params.param;
  const filePath = path.join(DOCUMENT_STORAGE_PATH, fileName);
  if (!isPathWithinDirectory(DOCUMENT_STORAGE_PATH, filePath)) {
    return new AuthorizationError("Access denied").code(403);
  }

  if (!fs.existsSync(filePath)) {
    throw new NotFoundError("File not found");
  }

  // Read the encrypted file and decrypt it
  const decryptedStream = readFile(filePath);

  // Stream the decrypted content
  return h
    .response(decryptedStream)
    .header(
      "Content-Disposition",
      `attachment; filename="${request.params.param}"`
    )
    .type("application/pdf");
};

const routes = (handler) => [
  {
    method: "POST",
    path: "/document",
    handler: handler.postDocumentWithFileHandler,
    options: {
      auth: "jims_jwt",
      payload: {
        allow: "multipart/form-data",
        multipart: true,
        output: "stream",
        maxBytes: 5*1024*1024,
      },
    },
  },
  // {
  //   method: "POST",
  //   path: "/upload-document-excel",
  //   handler: handler.uploadBulkDocumentsFromExcel,
  //   options: {
  //     auth: "jims_jwt",
  //     payload: {
  //       allow: "multipart/form-data",
  //       multipart: true,
  //       output: "stream",
  //       maxBytes: 10485760 * 10 // 100 MB,
  //     },
  //   },
  // },
  {
    method: "GET",
    path: "/document/{param*}",
    handler: handleFileRequest,
    options: {
      auth: "jims_jwt",
    },
  },
  {
    method: "GET",
    path: "/document",
    handler: (request, h) => handler.getDocumentHandler(request, h),
    options: {
      auth: "jims_jwt",
    },
  },
];

module.exports = routes;
