const autoBind = require("auto-bind");

function parseBoolish(v, defaultValue = false) {
  if (v === undefined || v === null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true") return true;
  if (s === "0" || s === "false") return false;
  return defaultValue;
}

class SubledgersHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async listByBpSummary(request, h) {
    const organizationId = request.auth.credentials.organizationId;

    this._validator.validateListQuery(request.query);

    const fromDate = String(request.query.from_date || "").trim();
    const toDate = String(request.query.to_date || "").trim();
    const accountId = String(request.query.account_id || "").trim();
    const q = String(request.query.q || "").trim();
    const includeZero = parseBoolish(request.query.include_zero, false);
    const page = Number(request.query.page ?? 1);
    const limit = Number(request.query.limit ?? 50);

    const data = await this._service.listByBpSummary({
      organizationId,
      fromDate,
      toDate,
      accountId,
      q,
      includeZero,
      page,
      limit,
    });

    return h.response({ status: "success", data }).code(200);
  }

  async getBpDetail(request, h) {
    const organizationId = request.auth.credentials.organizationId;

    this._validator.validateDetailParams(request.params);
    this._validator.validateDetailQuery(request.query);

    const bpId = String(request.params.bpId || "").trim();
    const fromDate = String(request.query.from_date || "").trim();
    const toDate = String(request.query.to_date || "").trim();
    const accountId = String(request.query.account_id || "").trim();

    const data = await this._service.getBpDetail({
      organizationId,
      bpId,
      fromDate,
      toDate,
      accountId,
    });

    return h.response({ status: "success", data }).code(200);
  }
}

module.exports = SubledgersHandler;

