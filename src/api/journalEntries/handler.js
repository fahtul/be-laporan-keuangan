const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class JournalEntriesHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;

    autoBind(this);
  }

  async getById(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const { id } = request.params;

    const row = await this._service.getById({ organizationId, id });
    return h.response({ status: "success", data: row }).code(200);
  }

  async create(request, h) {
    this._validator.validateCreate(request.payload);

    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;

    const created = await this._service.create({
      organizationId,
      actorId,
      payload: request.payload,
    });

    await this._audit.log({
      organizationId,
      actorId,
      action: "journal_entry.create",
      entity: "journal_entry",
      entityId: created.id,
      before: null,
      after: created,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h.response({ status: "success", data: created }).code(201);
  }

  async update(request, h) {
    this._validator.validateUpdate(request.payload);

    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;
    const { id } = request.params;

    const { before, after } = await this._service.update({
      organizationId,
      id,
      payload: request.payload,
    });

    await this._audit.log({
      organizationId,
      actorId,
      action: "journal_entry.update",
      entity: "journal_entry",
      entityId: id,
      before,
      after,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h.response({ status: "success", data: after }).code(200);
  }

  async post(request, h) {
    // payload typically empty; validator keeps it clean
    this._validator.validatePost(request.payload || {});

    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;
    const { id } = request.params;

    const idemKey =
      request.headers["idempotency-key"] || request.headers["Idempotency-Key"];

    if (!idemKey) {
      return h
        .response({
          status: "fail",
          message: "Idempotency-Key header is required",
        })
        .code(400);
    }

    const result = await this._service.post({
      organizationId,
      id,
      actorId,
      idempotencyKey: String(idemKey),
    });

    // replay exact stored response (strong idempotency)
    if (result?.replay) {
      return h.response(result.responseBody).code(result.responseStatus || 200);
    }

    await this._audit.log({
      organizationId,
      actorId,
      action: "journal_entry.post",
      entity: "journal_entry",
      entityId: id,
      before: null,
      after: result.entry,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h.response({ status: "success", data: result.entry }).code(200);
  }

  async reverse(request, h) {
    this._validator.validateReverse(request.payload || {});

    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;
    const { id } = request.params;

    const created = await this._service.reverse({
      organizationId,
      id,
      actorId,
      payload: request.payload || {},
    });

    await this._audit.log({
      organizationId,
      actorId,
      action: "journal_entry.reverse",
      entity: "journal_entry",
      entityId: created.id,
      before: null,
      after: created,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h.response({ status: "success", data: created }).code(201);
  }
}

module.exports = JournalEntriesHandler;
