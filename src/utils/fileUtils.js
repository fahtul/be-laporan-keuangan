const path = require("path");
const { algorithm, key } = require("../services/storage/StorageService");
const fs = require("fs");
const crypto = require("crypto");
const NotFoundError = require("../exceptions/NotFoundError");
const AuthorizationError = require("../exceptions/AuthorizationError");

const createFileUtils = (storagePath) => {
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

  // Function to sanitize file path
  const sanitizePath = (param, storagePath) => {
    return path.resolve(storagePath, param);
  };

  // Server route handler
  const handleFileRequest = async (request, h) => {
    const fileName = request.params.param;
    const filePath = path.join(storagePath, fileName);
    if (!isPathWithinDirectory(storagePath, filePath)) {
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

  return {
    isPathWithinDirectory,
    readFile,
    sanitizePath,
    handleFileRequest,
  };
};

module.exports = createFileUtils;
