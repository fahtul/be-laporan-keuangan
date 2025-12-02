const autoBind = require("auto-bind");
const path = require("path");
const fs = require("fs");
const InvariantError = require("../../exceptions/InvariantError");
const Boom = require("@hapi/boom");
const { logError } = require("../../utils/logger");

class FaceHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async postFaceHandler(request, h) {
    try {
      const { user_id, photo } = request.payload;
      console.log("Payload received:", request.payload);

      this._validator.validateUploadPayload({ user_id, photo });

      if (!photo || !photo.hapi) {
        throw new InvariantError("Photo is required and must be a file");
      }

      const filename = `${Date.now()}-${photo.hapi.filename}`;
      const relativePath = await this._service.saveFaceImage(
        user_id,
        photo,
        filename
      );

      return h
        .response({
          status: "success",
          message: "Face image uploaded successfully",
          data: { user_id, file: relativePath },
        })
        .code(201);
    } catch (error) {
      console.error("❌ Error in postFaceHandler:", error);
      logError("❌ Error in postFaceHandler", error); // Tambahkan ini

      if (error.isBoom || error instanceof InvariantError) {
        throw error;
      }

      throw Boom.internal("Terjadi kesalahan saat upload gambar.");
    }
  }

  async putFaceHandler(request, h) {
    const { userId, photo, oldFilename } = request.payload;

    this._validator.validateUpdatePayload({ userId, photo, oldFilename });

    const filename = `${Date.now()}-${photo.hapi.filename}`;
    const relativePath = await this._service.updateFaceImage(
      userId,
      photo,
      filename,
      oldFilename
    );

    return h
      .response({
        status: "success",
        message: "Face image updated successfully",
        data: { userId, file: relativePath },
      })
      .code(200);
  }

  async getFaceHandler(request, h) {
    const { userId } = request.params;

    try {
      const image = await this._service.getFaceImage(userId);
      if (!image) {
        return h
          .response({ status: "fail", message: "No face image found" })
          .code(404);
      }

      return h
        .response({
          status: "success",
          data: image,
        })
        .code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  async deleteFaceHandler(request, h) {
    const { userId } = request.params;

    await this._service.deleteFaceImage(userId);

    return h
      .response({
        status: "success",
        message: "Face image deleted successfully",
      })
      .code(200);
  }

  async getSecureFaceImageHandler(request, h) {
    try {
      const { filename } = request.params;
      const filepath = path.resolve(__dirname, "../../uploads/faces", filename);

      if (!fs.existsSync(filepath)) {
        return h
          .response({ status: "fail", message: "File not found" })
          .code(404);
      }

      return h.file(filepath);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal server error" })
        .code(500);
    }
  }

  /**
   * GET /face/{userId}/status
   * Returns { exists: true|false }
   */
  async checkFaceStatusHandler(request, h) {
    const { userId } = request.params;
    try {
      const exists = await this._service.hasFaceImage(userId);
      return {
        status: "success",
        data: { exists },
      };
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal server error" })
        .code(500);
    }
  }
}

module.exports = FaceHandler;
