const autoBind = require("auto-bind");
const PayrollService = require("../../services/mssql/PayrollService");

class PayrollHandler {
  constructor(service) {
    this._service = service;
    autoBind(this);
  }

  // GET /payroll?month=YYYY-MM
  async getPayrollHandler(request, h) {
    const month = request.query.month;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return h
        .response({ status: "fail", message: "Invalid month format" })
        .code(400);
    }
    try {
      const data = await this._service.getPayrollByMonth(month);
      return h
        .response({ status: "success", data: { payroll: data } })
        .code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }
}

module.exports = PayrollHandler;
