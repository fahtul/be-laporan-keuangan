// src/api/salaryRules/handler.js
const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class SalaryRulesHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  // GET /salary-rules
  async getAllSalaryRulesHandler(request, h) {
    try {
      const rules = await this._service.getAllRules();
      return h.response({ status: "success", data: { rules } }).code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({
          status: "error",
          message: "Gagal mengambil daftar salary rules",
        })
        .code(500);
    }
  }

  // POST /salary-rules
  async postSalaryRuleHandler(request, h) {
    // validate create payload (requires userId + all fields)
    this._validator.validateCreatePayload(request.payload);
    const payload = request.payload;

    try {
      await this._service.addRule(payload);
      return h
        .response({ status: "success", message: "Salary rule created" })
        .code(201);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // GET /salary-rules/{id}
  async getSalaryRuleHandler(request, h) {
    const { id: userId } = request.params;
    try {
      const rule = await this._service.getRule(userId);
      return h.response({ status: "success", data: { rule } }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(404);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // PUT /salary-rules/{id}
  async putSalaryRuleHandler(request, h) {
    // validate update payload (only salary fields, no userId)
    this._validator.validateUpdatePayload(request.payload);
    const { id: userId } = request.params;
    const payload = request.payload;

    try {
      await this._service.updateRule(userId, payload);
      return h
        .response({ status: "success", message: "Salary rule updated" })
        .code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(404);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // DELETE /salary-rules/{id}
  async deleteSalaryRuleHandler(request, h) {
    const { id: userId } = request.params;
    try {
      await this._service.deleteRule(userId);
      return h
        .response({ status: "success", message: "Salary rule deleted" })
        .code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }
}

module.exports = SalaryRulesHandler;
