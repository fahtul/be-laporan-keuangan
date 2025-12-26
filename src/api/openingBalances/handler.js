const autoBind = require("auto-bind");

class OpeningBalancesHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;
    autoBind(this);
  }

  async getByKey(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const openingKey = String(request.query.opening_key ?? "").trim();

    if (!openingKey) {
      return h
        .response({ status: "fail", message: "opening_key is required" })
        .code(400);
    }

    const data = await this._service.getOpeningByKey({
      organizationId,
      openingKey,
    });
    return h.response({ status: "success", data }).code(200);
  }

  async create(request, h) {
    this._validator.validateCreate(request.payload || {});

    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;

    const created = await this._service.createOpeningBalance({
      organizationId,
      actorId,
      payload: request.payload,
    });

    // audit optional
    if (this._audit?.log) {
      await this._audit.log({
        organizationId,
        actorId,
        action: "opening_balance.create",
        entity: "journal_entry",
        entityId: created.id,
        before: null,
        after: created,
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });
    }

    return h.response({ status: "success", data: created }).code(201);
  }
}

module.exports = OpeningBalancesHandler;
