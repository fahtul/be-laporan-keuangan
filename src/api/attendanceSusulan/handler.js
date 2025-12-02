// src/api/attendanceSusulan/handler.js
const ClientError = require("../../exceptions/ClientError");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

class AttendanceSusulanHandler {
  constructor(service, usersService, validator) {
    this._service = service;
    this._usersService = usersService; // Assuming usersService is part of the service
    this._validator = validator;

    this.postSusulanHandler = this.postSusulanHandler.bind(this);
    this.updateSusulanHandler = this.updateSusulanHandler.bind(this);
    this.getSusulanHandler = this.getSusulanHandler.bind(this);
  }

  // POST /attendance/susulan
  async postSusulanHandler(request, h) {
    try {
      await this._validator.validateCreateSusulan(request.payload);
      const { type, attendance_date, checkin_time, checkout_time, reason } =
        request.payload;
      const userId = request.auth.credentials.id;

      const id = await this._service.createRequest({
        userId,
        type,
        attendance_date,
        checkin_time,
        checkout_time,
        reason,
      });

      return h
        .response({ status: "success", data: { requestId: id } })
        .code(201);
    } catch (err) {
      console.error(err); // Log the error for debugging
      const code = err.isJoi
        ? 400
        : err instanceof ClientError
        ? err.statusCode
        : 500;
      return h.response({ status: "fail", message: err.message }).code(code);
    }
  }

  // PUT /attendance/susulan/{id}
  async updateSusulanHandler(request, h) {
    const { id } = request.params;
    try {
      await this._validator.validateUpdateSusulan(request.payload);
      await this._service.getRequestById(id);
      await this._usersService.getIsUserAdmin(request.auth.credentials.id);
      const { status, note } = request.payload;
      await this._service.updateRequestStatus(id, { status, note });
      return { status: "success", message: `Susulan berhasil ${status}` };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return h.response({ status: "fail", message: err.message }).code(404);
      }
      if (err.isJoi || err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      throw err;
    }
  }

  async getSusulanHandler(request, h) {
    const { id: userId, admin_status: adminStatus } = request.auth.credentials;
    const isAdmin = Boolean(adminStatus);
    try {
      const items = await this._service.getSusulan(userId, isAdmin);
      return h.response({
        status: "success",
        data: { susulan: items },
      });
    } catch (err) {
      console.error("Error in getSusulanHandler:", err);
      throw new ClientError("Gagal mengambil data susulan");
    }
  }
}

module.exports = AttendanceSusulanHandler;
