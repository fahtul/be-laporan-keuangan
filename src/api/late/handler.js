// src/api/late/handler.js
const autoBind = require("auto-bind");

class LateHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async getMonthlyLateSummaryHandler(request, h) {
    this._validator.validateMonthlyLateQuery(request.query);
    const {
      year,
      month,
      status,
      group = "user",
      sort_by,
      sort_dir,
    } = request.query;

    const data = await this._service.getMonthlyLateSummary({
      year: +year,
      month: +month,
      status,
      group,
      sortBy: sort_by,
      sortDir: sort_dir,
    });

    return h.response({ status: "success", data });
  }
}

module.exports = LateHandler;
