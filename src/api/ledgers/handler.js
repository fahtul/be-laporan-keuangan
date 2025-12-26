const autoBind = require("auto-bind");

class LedgersHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async getLedger(request, h) {
    try {
      const organizationId = request.auth.credentials.organizationId;

      const payload = {
        account_id: request.query.account_id,
        from_date: request.query.from_date,
        to_date: request.query.to_date,
      };

      this._validator.validateGet(payload);

      const data = await this._service.getLedger({
        organizationId,
        accountId: payload.account_id,
        fromDate: payload.from_date,
        toDate: payload.to_date,
      });

      return h.response({ status: "success", data }).code(200);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

module.exports = LedgersHandler;
