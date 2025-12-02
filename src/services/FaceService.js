const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

class FaceService {
  constructor() {
    this._uploadDir = path.resolve(__dirname, "../uploads/faces");
    if (!fs.existsSync(this._uploadDir)) {
      fs.mkdirSync(this._uploadDir, { recursive: true });
    }
  }

  async saveFaceImage(userId, file) {
    const ext = path.extname(file.hapi.filename).toLowerCase() || ".jpg";
    // 2) set filename = userId + ext
    const filename = `${userId}${ext}`;
    const filepath = path.join(this._uploadDir, filename);

    const fileStream = fs.createWriteStream(filepath);
    await new Promise((resolve, reject) => {
      file.pipe(fileStream);
      file.on("end", resolve);
      file.on("error", reject);
    });

    return filename;
  }

  async deleteFaceImage(filename) {
    const filepath = path.join(this._uploadDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  async updateFaceImage(userId, newFile, oldFilename) {
    if (oldFilename) {
      await this.deleteFaceImage(oldFilename);
    }
    return this.saveFaceImage(userId, newFile);
  }

  async getFaceImage(userId) {
    const files = await fs.promises.readdir(this._uploadDir);

    const matchedFile = files.find((filename) =>
      filename.startsWith(`${userId}`)
    );

    if (!matchedFile) {
      throw new Error("Face image not found for this user.");
    }

    return matchedFile;
  }

  async hasFaceImage(userId) {
    const files = await fs.promises.readdir(this._uploadDir);
    return files.some((f) => f.startsWith(userId));
  }
}

module.exports = FaceService;
