const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class LeaveHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  // POST /leaves
  async postLeaveHandler(request, h) {
    this._validator.validateCreatePayload(request.payload);

    // pull userId from JWT
    const userId = request.auth.credentials.id;

    // normalize the type
    let { type, start_date, end_date, reason } = request.payload;
    if (type === "cuti") type = "holiday";
    if (type === "sakit") type = "sick";

    await this._service.requestLeave({
      userId,
      type,
      start_date,
      end_date,
      reason,
    });

    return h
      .response({ status: "success", message: "Leave requested" })
      .code(201);
  }

  // GET /leaves
  async getLeavesHandler(request, h) {
    const { userId, status } = request.query;
    const leaves = await this._service.getLeaves({ userId, status });
    return h.response({ status: "success", data: { leaves } }).code(200);
  }

  // GET /leaves/{id}
  async getLeaveByIdHandler(request, h) {
    const { id } = request.params;
    try {
      const leave = await this._service.getLeaveById(id);
      return h.response({ status: "success", data: { leave } }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(404);
      }
      throw err;
    }
  }

  // PUT /leaves/{id}/approve/{level}
  async putApproveHandler(request, h) {
    this._validator.validateApprovePayload(request.params);
    const { id, level } = request.params;
    const approverId = request.auth.credentials.id;
    try {
      switch (level) {
        case "unit":
          await this._service.approveUnit(id, approverId);
          break;
        case "division":
          await this._service.approveDivision(id, approverId);
          break;
        case "director":
          await this._service.approveDirector(id, approverId);
          break;
        default:
          throw new InvariantError("Invalid approval level");
      }
      return h.response({ status: "success", message: "Approved" }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      throw err;
    }
  }

  // PUT /leaves/{id}/reject/{level}
  async putRejectHandler(request, h) {
    this._validator.validateApprovePayload(request.params);
    const { id, level } = request.params;
    const approverId = request.auth.credentials.id;
    try {
      switch (level) {
        case "unit":
          await this._service.rejectUnit(id, approverId);
          break;
        case "division":
          await this._service.rejectDivision(id, approverId);
          break;
        case "director":
          await this._service.rejectDirector(id, approverId);
          break;
        default:
          throw new InvariantError("Invalid rejection level");
      }
      return h.response({ status: "success", message: "Rejected" }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      throw err;
    }
  }
}

module.exports = LeaveHandler;
