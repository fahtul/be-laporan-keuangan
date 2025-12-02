const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const algorithm = process.env.ALGORITHM;
const key = Buffer.from(process.env.FILE_TOKEN_KEY, "hex");
const iv = crypto.randomBytes(16);

class StorageService {
  constructor(folder) {
    this._folder = folder;

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  }

  getFolder() {
    return this._folder;
  }

  async writeImageFile(file, { filename, headers }) {
    // 'file' adalah stream (Hapi), simpan ke folder 'uploads'
    const extension = headers["content-type"].split("/")[1];
    const uniqueName = `${filename}-${Date.now()}.${extension}`;
    const filePath = path.join(this._folder, uniqueName);

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      file.pipe(writeStream);

      file.on("error", (err) => {
        reject(err);
      });

      writeStream.on("finish", () => {
        resolve(uniqueName);
      });

      writeStream.on("error", (err) => {
        reject(err);
      });
    });
  }

  writeFile(file, meta) {
    return new Promise((resolve, reject) => {
      const iv = crypto.randomBytes(16); // Generate a random IV
      const cipher = crypto.createCipheriv(algorithm, key, iv);

      const filename = `${Date.now()}_${meta.filename}`;
      const filePath = path.join(this._folder, filename);
      const ivFilePath = `${filePath}.iv`; // Path to store the IV

      const fileStream = fs.createWriteStream(filePath);

      // Encrypt the file and write it to the stream
      const encryptedStream = file.pipe(cipher);

      // Save IV to a separate file
      fs.writeFile(ivFilePath, iv, (err) => {
        if (err) {
          return reject(err);
        }

        // Handle the streams
        encryptedStream.pipe(fileStream);

        encryptedStream.on("error", (error) => {
          fs.unlink(filePath, () => {
            reject(error);
          });
        });

        fileStream.on("finish", () => {
          resolve(filename);
        });

        fileStream.on("error", (error) => {
          reject(error);
        });
      });
    });
  }

  writeFileBulk(file, fileName) {
    return new Promise((resolve, reject) => {
      const iv = crypto.randomBytes(16); // Generate a random IV
      const cipher = crypto.createCipheriv(algorithm, key, iv);

      const filename = `${Date.now()}_${fileName}`;
      const filePath = path.join(this._folder, filename);
      const ivFilePath = `${filePath}.iv`; // Path to store the IV

      const fileStream = fs.createWriteStream(filePath);

      // Encrypt the file and write it to the stream
      const encryptedStream = file.pipe(cipher);

      // Save IV to a separate file
      fs.writeFile(ivFilePath, iv, (err) => {
        if (err) {
          return reject(err);
        }

        // Handle the streams
        encryptedStream.pipe(fileStream);

        encryptedStream.on("error", (error) => {
          fs.unlink(filePath, () => {
            reject(error);
          });
        });

        fileStream.on("finish", () => {
          resolve(filename);
        });

        fileStream.on("error", (error) => {
          reject(error);
        });
      });
    });
  }

  readFile(filePath) {
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    const readStream = fs.createReadStream(filePath);

    const decryptedStream = readStream.pipe(decipher);

    return decryptedStream;
  }

  writeImageFile(file, meta) {
    return new Promise((resolve, reject) => {
      const filename = `${Date.now()}_${meta.filename}`;
      const filePath = path.join(this._folder, filename);

      const fileStream = fs.createWriteStream(filePath);

      file.pipe(fileStream);

      fileStream.on("finish", () => {
        resolve(filename);
      });

      fileStream.on("error", (error) => {
        reject(error);
      });
    });
  }

  readImageFile(filePath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath);

      readStream.on("error", (error) => {
        reject(error);
      });

      resolve(readStream);
    });
  }
}

module.exports = { StorageService, algorithm, key };
