const autoBind = require("auto-bind");

class PresenceHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async getMonthlySummaryHandler(request, h) {
    this._validator.validateMonthlySummaryQuery(request.query);
    const {
      year,
      month,
      from_date,
      to_date,
      group = "user",
      sort_by,
      sort_dir,
    } = request.query;

    const data = await this._service.getSummary({
      year: year ? +year : undefined,
      month: month ? +month : undefined,
      fromDate: from_date,
      toDate: to_date,
      group,
      sortBy: sort_by,
      sortDir: sort_dir,
    });

    return h.response({ status: "success", data });
  }

  async getUserDetailHandler(request, h) {
    this._validator.validateUserDetailQuery({
      ...request.params,
      ...request.query,
    });
    const { userId } = request.params;
    const { year, month, from_date, to_date } = request.query;

    const data = await this._service.getUserDetail({
      userId,
      year: year ? +year : undefined,
      month: month ? +month : undefined,
      fromDate: from_date,
      toDate: to_date,
    });

    return h.response({ status: "success", data });
  }
}

module.exports = PresenceHandler;
