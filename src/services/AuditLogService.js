const knex = require("../database/knex");

class AuditLogService {
  async log({
    organizationId,
    actorId,
    action,
    entity,
    entityId,
    before,
    after,
    ip,
    userAgent,
  }) {
    await knex("audit_logs").insert({
      id: knex.raw("gen_random_uuid()"),
      organization_id: organizationId,
      actor_id: actorId,
      action,
      entity,
      entity_id: entityId || null,
      before: before ? JSON.stringify(before) : null,
      after: after ? JSON.stringify(after) : null,
      ip: ip || null,
      user_agent: userAgent || null,
      created_at: knex.fn.now(),
    });
  }
}

module.exports = AuditLogService;
