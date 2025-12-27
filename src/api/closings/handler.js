const autoBind = require("auto-bind");

class ClosingsHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async getYearEndStatus(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    this._validator.validateStatusQuery(request.query);

    const year = String(request.query.year || "").trim();

    const data = await this._service.getYearEndStatus({ organizationId, year });
    return h.response({ status: "success", data }).code(200);
  }

  async postYearEndClosing(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;

    this._validator.validateRunPayload(request.payload || {});

    const payload = request.payload || {};

    const year = String(payload.year || "").trim();
    const date = payload.date ? String(payload.date).trim() : null;
    const memo = payload.memo !== undefined ? payload.memo : null;
    const retainedEarningsAccountId = String(
      payload.retained_earnings_account_id || ""
    ).trim();
    const generateOpening =
      payload.generate_opening === undefined ? true : !!payload.generate_opening;

    const data = await this._service.runYearEndClosing({
      organizationId,
      actorId,
      year,
      date,
      memo,
      retainedEarningsAccountId,
      generateOpening,
    });

    if (this._audit?.log) {
      await this._audit.log({
        organizationId,
        actorId,
        action: "closing.year_end",
        entity: "journal_entry",
        entityId: data.closing_entry_id,
        before: null,
        after: data,
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
    }

    return h.response({ status: "success", data }).code(201);
  }
}

module.exports = ClosingsHandler;

