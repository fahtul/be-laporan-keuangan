const InvariantError = require("../../exceptions/InvariantError");
const autoBind = require("auto-bind");

class AccountsHandler {
  constructor(service, validator, auditLogService) {
    this._service = service;
    this._validator = validator;
    this._audit = auditLogService;

    autoBind(this);
  }

  async list(request, h) {
    const orgId = request.auth.credentials.organizationId;

    const page = Number(request.query.page ?? 1);
    const limit = Number(request.query.limit ?? 20);
    const q = (request.query.q ?? "").toString().trim();
    const includeInactive =
      String(request.query.include_inactive ?? "false") === "true";

    if (page < 1 || limit < 1 || limit > 100) {
      return h
        .response({ status: "fail", message: "Invalid pagination" })
        .code(400);
    }

    const result = await this._service.list({
      orgId,
      page,
      limit,
      q,
      includeInactive,
    });

    return h.response({
      status: "success",
      data: result.items,
      meta: result.meta,
    });
  }

  async options(request, h) {
    const orgId = request.auth.credentials.organizationId;

    const q = (request.query.q ?? "").toString().trim();
    const limit = Number(request.query.limit ?? 20);
    const includeInactive =
      String(request.query.include_inactive ?? "false") === "true";

    const items = await this._service.options({
      orgId,
      q,
      limit,
      includeInactive,
    });

    return h.response({ status: "success", data: items });
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

    try {
      const created = await this._service.create({
        organizationId,
        payload: request.payload,
      });

      await this._audit.log({
        organizationId,
        actorId,
        action: "account.create",
        entity: "account",
        entityId: created.id,
        before: null,
        after: created,
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });

      return h.response({ status: "success", data: created }).code(201);
    } catch (err) {
      const msg = String(err?.message || "");

      // ✅ karena service kamu throw InvariantError, tangkap ini dulu
      const isDuplicateCode =
        err?.name === "InvariantError" &&
        (err?.statusCode === 409 || err?.statusCode === 400) &&
        msg.toLowerCase().includes("code already exists");

      if (isDuplicateCode) {
        const code = request.payload?.code;

        // cari termasuk soft deleted (tanpa whereNull deleted_at)
        const existing = await this._service.findByCodeAny({
          organizationId,
          code,
        });

        // soft deleted kalau deleted_at tidak null
        if (existing && existing.deleted_at) {
          return h
            .response({
              status: "fail",
              message:
                "Account dengan code ini pernah dibuat dan sedang terhapus (soft delete). Kamu bisa restore akun tersebut.",
              error_code: "ACCOUNT_SOFT_DELETED",
              data: {
                id: existing.id,
                code: existing.code,
                name: existing.name,
                type: existing.type,
                parent_id: existing.parent_id,
                is_postable: existing.is_postable,
              },
            })
            .code(409);
        }

        // existing aktif => memang sudah kepakai
        return h
          .response({
            status: "fail",
            message: "Account code already exists in this organization",
            error_code: "ACCOUNT_CODE_EXISTS",
          })
          .code(409);
      }

      // lainnya lempar biar global handler proses
      throw err;
    }
  }

  async restoreAccountHandler(request, h) {
    const organizationId = request.auth.credentials.organizationId; // ✅ ini yang benar di project kamu
    const { id } = request.params;

    if (!organizationId) {
      // biar errornya jelas, bukan "undefined binding"
      return h
        .response({
          status: "fail",
          message: "organizationId is missing in auth credentials",
        })
        .code(401);
    }

    const restored = await this._service.restore({ organizationId, id });

    await this._audit.log({
      organizationId,
      actorId: request.auth.credentials.id,
      action: "account.restore",
      entity: "account",
      entityId: id,
      before: null,
      after: restored,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h.response({ status: "success", data: restored }).code(200);
  }

  async update(request, h) {
    this._validator.validateUpdate(request.payload);

    const orgId = request.auth.credentials.organizationId;
    const actorId = request.auth.credentials.id;
    const { id } = request.params;

    const { before, after } = await this._service.update({
      organizationId: orgId,
      id,
      payload: request.payload,
    });

    await this._audit.log({
      organizationId: orgId,
      actorId,
      action: "account.update",
      entity: "account",
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
    const id = request.params.id;

    const before = await this._service.getById({ organizationId, id });

    await this._service.softDelete({ organizationId, id });

    await this._audit.log({
      organizationId,
      actorId,
      action: "account.delete",
      entity: "account",
      entityId: id,
      before,
      after: null,
      ip: request.info.remoteAddress,
      userAgent: request.headers["user-agent"],
    });

    return h
      .response({ status: "success", message: "Account deleted" })
      .code(200);
  }

  async findByCodeAny({ organizationId, code }) {
    return this._db("accounts")
      .select(
        "id",
        "code",
        "name",
        "type",
        "parent_id",
        "is_postable",
        "is_deleted",
        "deleted_at"
      )
      .where({ organization_id: organizationId, code })
      .first();
  }
}

module.exports = AccountsHandler;
