const knex = require("../../database/knex");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

class BusinessPartnersService {
  // ========== List ==========
  async list({
    organizationId,
    page,
    limit,
    q = "",
    category = "",
    includeInactive = false,
  }) {
    if (!organizationId) {
      throw new InvariantError("organizationId is required");
    }

    const offset = (page - 1) * limit;

    const base = knex("business_partners as bp")
      .where("bp.organization_id", organizationId)
      .whereNull("bp.deleted_at");

    if (!includeInactive) base.andWhere("bp.is_active", true);
    if (category) base.andWhere("bp.category", category);

    if (q) {
      const qq = `%${q}%`;
      base.andWhere((qb) => {
        qb.whereILike("bp.code", qq).orWhereILike("bp.name", qq);
      });
    }

    const totalRow = await base.clone().count("* as c").first();
    const total = Number(totalRow?.c ?? 0);

    const items = await base
      .clone()
      .select(
        "bp.id",
        "bp.organization_id",
        "bp.code",
        "bp.name",
        "bp.category",
        "bp.normal_balance",
        "bp.is_active",
        "bp.created_at",
        "bp.updated_at"
      )
      .orderBy("bp.code", "asc")
      .limit(limit)
      .offset(offset);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        q,
        includeInactive,
      },
    };
  }

  // ========== Options ==========
  async options({ orgId, q = "", limit = 20, includeInactive = false }) {
    const capped = Math.min(Math.max(Number(limit || 20), 1), 200);

    const base = knex("business_partners as bp")
      .where("bp.organization_id", orgId)
      .whereNull("bp.deleted_at");

    if (!includeInactive) base.andWhere("bp.is_active", true);

    if (q) {
      const qq = `%${q}%`;
      base.andWhere((qb) => {
        qb.whereILike("bp.code", qq).orWhereILike("bp.name", qq);
      });
    }

    return base
      .select("bp.id", "bp.code", "bp.name", "bp.category", "bp.normal_balance")
      .orderBy("bp.code", "asc")
      .limit(capped);
  }

  // ========== Read ==========
  async getById({ organizationId, id }) {
    const row = await knex("business_partners")
      .select(
        "id",
        "organization_id",
        "code",
        "name",
        "category",
        "normal_balance",
        "is_active",
        "is_deleted",
        "deleted_at",
        "created_at",
        "updated_at"
      )
      .where({ organization_id: organizationId, id })
      .whereNull("deleted_at")
      .first();

    if (!row) throw new NotFoundError("Business partner not found");
    return row;
  }

  // untuk handler create: cek code termasuk soft deleted
  async findByCodeAny({ organizationId, code }) {
    return knex("business_partners")
      .select(
        "id",
        "organization_id",
        "code",
        "name",
        "category",
        "normal_balance",
        "is_active",
        "is_deleted",
        "deleted_at"
      )
      .where({ organization_id: organizationId, code })
      .first();
  }

  // ========== Create ==========
  async create({ organizationId, payload }) {
    const code = String(payload.code || "").trim();
    const name = String(payload.name || "").trim();

    const category = payload.category ?? "other";
    const normalBalance = payload.normal_balance ?? "debit";
    const isActive =
      payload.is_active !== undefined ? !!payload.is_active : true;

    try {
      const [created] = await knex("business_partners")
        .insert({
          organization_id: organizationId,
          code,
          name,
          category,
          normal_balance: normalBalance,
          is_active: isActive,
          is_deleted: false,
          deleted_at: null,
          created_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        })
        .returning(["id"]);

      const id = created?.id;
      return this.getById({ organizationId, id });
    } catch (err) {
      // unique violation postgres
      if (err?.code === "23505") {
        const e = new InvariantError("code already exists");
        e.statusCode = 409;
        throw e;
      }
      throw err;
    }
  }

  // ========== Update ==========
  async update({ organizationId, id, payload }) {
    const before = await this.getById({ organizationId, id });

    const next = {
      code:
        payload.code !== undefined
          ? String(payload.code || "").trim()
          : before.code,
      name:
        payload.name !== undefined
          ? String(payload.name || "").trim()
          : before.name,
      category:
        payload.category !== undefined ? payload.category : before.category,
      normal_balance:
        payload.normal_balance !== undefined
          ? payload.normal_balance
          : before.normal_balance,
      is_active:
        payload.is_active !== undefined
          ? !!payload.is_active
          : before.is_active,
    };

    try {
      await knex("business_partners")
        .where({ organization_id: organizationId, id })
        .whereNull("deleted_at")
        .update({
          ...next,
          updated_at: knex.fn.now(),
        });
    } catch (err) {
      if (err?.code === "23505") {
        const e = new InvariantError("code already exists");
        e.statusCode = 409;
        throw e;
      }
      throw err;
    }

    const after = await this.getById({ organizationId, id });
    return { before, after };
  }

  // ========== Soft Delete ==========
  async softDelete({ organizationId, id }) {
    await this.getById({ organizationId, id }); // ensure exists

    await knex("business_partners")
      .where({ organization_id: organizationId, id })
      .whereNull("deleted_at")
      .update({
        is_deleted: true,
        deleted_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });

    return true;
  }

  // ========== Restore ==========
  async restore({ organizationId, id }) {
    const row = await knex("business_partners")
      .select("id", "deleted_at")
      .where({ organization_id: organizationId, id })
      .first();

    if (!row) throw new NotFoundError("Business partner not found");
    if (!row.deleted_at)
      throw new InvariantError("Business partner is not deleted");

    await knex("business_partners")
      .where({ organization_id: organizationId, id })
      .update({
        is_deleted: false,
        deleted_at: null,
        updated_at: knex.fn.now(),
      });

    // getById hanya baca yang deleted_at null => aman
    return this.getById({ organizationId, id });
  }
}

module.exports = BusinessPartnersService;
