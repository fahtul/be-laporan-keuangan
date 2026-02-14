const autoBind = require("auto-bind");

class JournalEntriesHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;

    autoBind(this);
  }

  async list(request, h) {
    const organizationId = request.auth.credentials.organizationId;

    const page = Number(request.query.page ?? 1);
    const limit = Number(request.query.limit ?? 20);
    const q = (request.query.q ?? "").toString().trim();

    const status = (request.query.status ?? "").toString().trim(); // draft|posted|void
    const fromDate = (request.query.from_date ?? "").toString().trim() || null;
    const toDate = (request.query.to_date ?? "").toString().trim() || null;

    if (page < 1 || limit < 1 || limit > 100) {
      return h
        .response({ status: "fail", message: "Invalid pagination" })
        .code(400);
    }

    if (status && !["draft", "posted", "void"].includes(status)) {
      return h
        .response({ status: "fail", message: "Invalid status filter" })
        .code(400);
    }

    const result = await this._service.list({
      organizationId,
      page,
      limit,
      q,
      status,
      fromDate,
      toDate,
    });

    return h.response({
      status: "success",
      data: result.items,
      meta: result.meta,
    });
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

  async remove(request, h) {
    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;
    const { id } = request.params;

    const before = await this._service.getById({ organizationId, id });

    await this._service.softDelete({ organizationId, id });

    await this._audit.log({
      organizationId,
      actorId,
      action: "journal_entry.delete",
      entity: "journal_entry",
      entityId: id,
      before,
      after: null,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h
      .response({ status: "success", message: "Journal entry deleted" })
      .code(200);
  }

  async amend(request, h) {
    this._validator.validateAmend(request.payload || {});

    const organizationId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;
    const { id } = request.params;

    const result = await this._service.amend({
      organizationId,
      id,
      actorId,
      payload: request.payload || {},
    });

    await this._audit.log({
      organizationId,
      actorId,
      action: "journal_entry.amend",
      entity: "journal_entry",
      entityId: id,
      before: result.original_entry,
      after: {
        reversing_entry: result.reversing_entry,
        corrected_entry: result.corrected_entry,
      },
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h.response({ status: "success", data: result }).code(201);
  }

  async post(request, h) {
    try {
      this._validator.validatePost(request.payload || {});

      const organizationId = request.auth.credentials.organizationId;
      const actorId = request.auth.credentials.id;
      const { id } = request.params;

      // Hapi lowercases all header keys
      const idemKey = request.headers["idempotency-key"];

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

      if (result?.replay) {
        return h
          .response(result.responseBody)
          .code(result.responseStatus || 200);
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
    } catch (error) {
      console.error(error);
      throw error;
    }
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
