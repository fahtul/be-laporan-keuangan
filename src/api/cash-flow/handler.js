const autoBind = require("auto-bind");

function parseBoolish(v, defaultValue = false) {
  if (v === undefined || v === null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true") return true;
  if (s === "0" || s === "false") return false;
  return defaultValue;
}

class CashFlowHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async getCashFlow(request, h) {
    const organizationId = request.auth.credentials.organizationId;

    this._validator.validateQuery(request.query);

    const fromDate = String(request.query.from_date || "").trim();
    const toDate = String(request.query.to_date || "").trim();

    const includeZero = parseBoolish(request.query.include_zero, false);
    const includeDetails = parseBoolish(request.query.include_details, true);

    const rawCashIds = request.query.cash_account_ids;
    const cashAccountIds = Array.isArray(rawCashIds)
      ? rawCashIds
      : rawCashIds
        ? [rawCashIds]
        : null;

    const cashPrefix = String(request.query.cash_prefix || "11").trim() || "11";

    const data = await this._service.getCashFlow({
      organizationId,
      fromDate,
      toDate,
      includeZero,
      includeDetails,
      cashAccountIds,
      cashPrefix,
    });

    if (this._audit?.log) {
      const actorId = request.auth.credentials.id;
      await this._audit.log({
        organizationId,
        actorId,
        action: "cash_flow.view",
        entity: "cash_flow",
        entityId: null,
        before: null,
        after: {
          from_date: fromDate,
          to_date: toDate,
          include_zero: includeZero,
          include_details: includeDetails,
          cash_prefix: cashPrefix,
          cash_account_ids: cashAccountIds || null,
        },
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
    }

    return h.response({ status: "success", data }).code(200);
  }
}

module.exports = CashFlowHandler;

