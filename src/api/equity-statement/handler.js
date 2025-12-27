const autoBind = require("auto-bind");

function parseBoolish(v, defaultValue = false) {
  if (v === undefined || v === null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true") return true;
  if (s === "0" || s === "false") return false;
  return defaultValue;
}

class EquityStatementHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async get(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    this._validator.validateQuery(request.query);

    const fromDate = String(request.query.from_date || "").trim();
    const toDate = String(request.query.to_date || "").trim();

    const includeZero = parseBoolish(request.query.include_zero, false);
    const includeHeader = parseBoolish(request.query.include_header, false);
    const useCodeRule = parseBoolish(request.query.use_code_rule, false);
    const includeVirtualProfit = parseBoolish(
      request.query.include_virtual_profit,
      true
    );
    const profitMode =
      String(request.query.profit_mode || "net").trim().toLowerCase() || "net";

    const data = await this._service.getReport({
      organizationId,
      fromDate,
      toDate,
      includeZero,
      includeHeader,
      useCodeRule,
      includeVirtualProfit,
      profitMode,
    });

    if (this._audit?.log) {
      const actorId = request.auth.credentials.id;
      await this._audit.log({
        organizationId,
        actorId,
        action: "equity_statement.view",
        entity: "equity_statement",
        entityId: null,
        before: null,
        after: {
          from_date: fromDate,
          to_date: toDate,
          include_zero: includeZero,
          include_header: includeHeader,
          use_code_rule: useCodeRule,
          include_virtual_profit: includeVirtualProfit,
          profit_mode: profitMode,
        },
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
    }

    return h.response({ status: "success", data }).code(200);
  }
}

module.exports = EquityStatementHandler;

