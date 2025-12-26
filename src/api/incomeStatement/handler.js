const autoBind = require("auto-bind");

function parseBoolish(v, defaultValue = false) {
  if (v === undefined || v === null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true") return true;
  if (s === "0" || s === "false") return false;
  return defaultValue;
}

function parseTaxRate(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n;
}

class IncomeStatementHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async getIncomeStatement(request, h) {
    const organizationId = request.auth.credentials.organizationId;

    this._validator.validateQuery(request.query);

    const fromDate = String(request.query.from_date || "").trim();
    const toDate = String(request.query.to_date || "").trim();
    const includeZero = parseBoolish(request.query.include_zero, false);
    const includeHeader = parseBoolish(request.query.include_header, false);
    const taxRate = parseTaxRate(request.query.tax_rate);
    const grouping =
      String(request.query.grouping || "excel").trim().toLowerCase() || "excel";

    const data = await this._service.getIncomeStatement({
      organizationId,
      fromDate,
      toDate,
      includeZero,
      includeHeader,
      taxRate,
      grouping,
    });

    // optional audit for view
    if (this._audit?.log) {
      const actorId = request.auth.credentials.id;
      await this._audit.log({
        organizationId,
        actorId,
        action: "income_statement.view",
        entity: "income_statement",
        entityId: null,
        before: null,
        after: {
          from_date: fromDate,
          to_date: toDate,
          grouping,
          includeZero,
          includeHeader,
          tax_rate: taxRate,
        },
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
    }

    return h.response({ status: "success", data }).code(200);
  }
}

module.exports = IncomeStatementHandler;
