const autoBind = require("auto-bind");

class ChartsHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async getIncomeStatementChart(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const q = this._validator.validateIncomeStatementQuery(request.query || {});
    const data = await this._service.getIncomeStatementSeries({
      organizationId,
      ...q,
    });
    return h.response({ status: "success", data }).code(200);
  }

  async getBalanceSheetChart(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const q = this._validator.validateBalanceSheetQuery(request.query || {});
    const data = await this._service.getBalanceSheetSeries({
      organizationId,
      ...q,
    });
    return h.response({ status: "success", data }).code(200);
  }

  async getEquityStatementChart(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const q = this._validator.validateEquityStatementQuery(request.query || {});
    const data = await this._service.getEquityStatementSeries({
      organizationId,
      ...q,
    });
    return h.response({ status: "success", data }).code(200);
  }

  async getCashFlowChart(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const q = this._validator.validateCashFlowQuery(request.query || {});
    const data = await this._service.getCashFlowSeries({
      organizationId,
      ...q,
    });
    return h.response({ status: "success", data }).code(200);
  }

  async getFinancialCharts(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const q = this._validator.validateFinancialsQuery(request.query || {});
    const data = await this._service.getFinancialCharts({
      organizationId,
      ...q,
    });
    return h.response({ status: "success", data }).code(200);
  }
}

module.exports = ChartsHandler;

