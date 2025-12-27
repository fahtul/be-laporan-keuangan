const autoBind = require("auto-bind");

function parseBoolish(v, defaultValue = false) {
  if (v === undefined || v === null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true") return true;
  if (s === "0" || s === "false") return false;
  return defaultValue;
}

class BalanceSheetHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async getBalanceSheet(request, h) {
    const organizationId = request.auth.credentials.organizationId;

    this._validator.validateQuery(request.query);

    const asOf = String(request.query.as_of || "").trim();
    const year =
      request.query.year !== undefined && request.query.year !== null && request.query.year !== ""
        ? Number(request.query.year)
        : Number(asOf.slice(0, 4));

    const includeZero = parseBoolish(request.query.include_zero, false);
    const includeHeader = parseBoolish(request.query.include_header, false);
    const profitBasis =
      String(request.query.profit_basis || "after_tax").trim().toLowerCase() ||
      "after_tax";

    const data = await this._service.getBalanceSheet({
      organizationId,
      asOf,
      year,
      includeZero,
      includeHeader,
      profitBasis,
    });

    if (this._audit?.log) {
      const actorId = request.auth.credentials.id;
      await this._audit.log({
        organizationId,
        actorId,
        action: "balance_sheet.view",
        entity: "balance_sheet",
        entityId: null,
        before: null,
        after: {
          as_of: asOf,
          year,
          include_zero: includeZero,
          include_header: includeHeader,
          profit_basis: profitBasis,
        },
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
    }

    return h.response({ status: "success", data }).code(200);
  }
}

module.exports = BalanceSheetHandler;

