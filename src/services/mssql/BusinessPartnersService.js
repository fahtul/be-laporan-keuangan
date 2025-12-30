const knex = require("../../database/knex");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");
const { parse: parseCsv } = require("csv-parse/sync");

function normalizeCategory(category) {
  const c = String(category || "").trim().toLowerCase();
  if (!c) return "other";
  if (c === "vendor") return "supplier";
  if (c === "insurance") return "insurer";
  return c;
}

function defaultNormalBalanceByCategory(category) {
  const c = normalizeCategory(category);
  if (c === "supplier") return "credit";
  if (c === "customer" || c === "insurer") return "debit";
  return "debit";
}

function normalizeNormalBalance(normalBalance, category) {
  const n = String(normalBalance || "").trim().toLowerCase();
  if (!n) return defaultNormalBalanceByCategory(category);
  if (n !== "debit" && n !== "credit") return defaultNormalBalanceByCategory(category);
  return n;
}

function normalizeIsActive(v, defaultValue = true) {
  if (v === undefined || v === null || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true") return true;
  if (s === "0" || s === "false") return false;
  return defaultValue;
}

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
    if (category) base.andWhere("bp.category", normalizeCategory(category));

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
        category,
        includeInactive,
      },
    };
  }

  // ========== Options ==========
  async options({
    orgId,
    q = "",
    limit = 20,
    category = "",
    includeInactive = false,
  }) {
    const capped = Math.min(Math.max(Number(limit || 20), 1), 200);

    const base = knex("business_partners as bp")
      .where("bp.organization_id", orgId)
      .whereNull("bp.deleted_at");

    if (!includeInactive) base.andWhere("bp.is_active", true);
    if (category) base.andWhere("bp.category", normalizeCategory(category));

    if (q) {
      const qq = `%${q}%`;
      base.andWhere((qb) => {
        qb.whereILike("bp.code", qq).orWhereILike("bp.name", qq);
      });
    }

    return base
      .select(
        "bp.id",
        "bp.code",
        "bp.name",
        "bp.category",
        "bp.normal_balance",
        "bp.is_active"
      )
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
    const norm = String(code || "").trim().toUpperCase();
    if (!norm) return null;

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
      .where({ organization_id: organizationId })
      .whereRaw("LOWER(code) = ?", [norm.toLowerCase()])
      .first();
  }

  // ========== Create ==========
  async create({ organizationId, payload }) {
    const code = String(payload.code || "").trim().toUpperCase();
    const name = String(payload.name || "").trim();

    const category = normalizeCategory(payload.category ?? "other");
    const normalBalance =
      payload.normal_balance ?? defaultNormalBalanceByCategory(category);
    const isActive =
      payload.is_active !== undefined ? !!payload.is_active : true;

    try {
      // pre-check case-insensitive unique per org (and detect soft-deleted too)
      const existing = await this.findByCodeAny({ organizationId, code });
      if (existing) {
        const e = new InvariantError("code already exists");
        e.statusCode = 409;
        throw e;
      }

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
          ? String(payload.code || "").trim().toUpperCase()
          : before.code,
      name:
        payload.name !== undefined
          ? String(payload.name || "").trim()
          : before.name,
      category:
        payload.category !== undefined
          ? normalizeCategory(payload.category)
          : before.category,
      normal_balance:
        payload.normal_balance !== undefined
          ? payload.normal_balance
          : before.normal_balance ?? defaultNormalBalanceByCategory(before.category),
      is_active:
        payload.is_active !== undefined
          ? !!payload.is_active
          : before.is_active,
    };

    try {
      if (payload.code !== undefined) {
        const existing = await knex("business_partners")
          .select("id", "deleted_at")
          .where({ organization_id: organizationId })
          .whereRaw("LOWER(code) = ?", [String(next.code || "").toLowerCase()])
          .first();

        if (existing && existing.id !== id) {
          const e = new InvariantError("code already exists");
          e.statusCode = 409;
          throw e;
        }
      }

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

  _template(templateName) {
    const t = String(templateName || "").trim().toLowerCase();
    if (t !== "hospital_bp_v1") {
      throw new InvariantError("Unknown template");
    }

    return [
      {
        code: "CUST-A",
        name: "Customer A",
        category: "customer",
        normal_balance: "debit",
        is_active: true,
      },
      {
        code: "BPJS",
        name: "BPJS Kesehatan",
        category: "insurer",
        normal_balance: "debit",
        is_active: true,
      },
      {
        code: "VEND-V",
        name: "Vendor V",
        category: "supplier",
        normal_balance: "credit",
        is_active: true,
      },
      {
        code: "VEND-ALKES",
        name: "Supplier Alkes",
        category: "supplier",
        normal_balance: "credit",
        is_active: true,
      },
      {
        code: "DOC-001",
        name: "Dokter Konsultan",
        category: "other",
        normal_balance: "credit",
        is_active: true,
      },
    ];
  }

  _parseCsv(csvText) {
    const rows = parseCsv(String(csvText || ""), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      category: r.category,
      normal_balance: r.normal_balance,
      is_active: r.is_active,
    }));
  }

  async importBusinessPartners({ organizationId, payload }) {
    const mode = String(payload.mode || "upsert").trim().toLowerCase();
    const source = String(payload.source || "json").trim().toLowerCase();
    const template = payload.template ? String(payload.template).trim() : null;

    let items = [];
    if (source === "template") items = this._template(template);
    else if (source === "csv") items = this._parseCsv(payload.csv);
    else items = Array.isArray(payload.business_partners) ? payload.business_partners : [];

    // normalize + validate minimum fields (fail-fast)
    const normalized = items.map((it, idx) => {
      const code = String(it?.code || "").trim().toUpperCase();
      const name = String(it?.name || "").trim();
      if (!code) throw new InvariantError(`Row ${idx + 1}: code is required`);
      if (!name) throw new InvariantError(`Row ${idx + 1}: name is required`);
      if (code.length > 50) throw new InvariantError(`Row ${idx + 1}: code too long`);
      if (name.length > 200) throw new InvariantError(`Row ${idx + 1}: name too long`);

      const category = normalizeCategory(it?.category ?? "other");
      const normalBalance = it?.normal_balance
        ? String(it.normal_balance).trim().toLowerCase()
        : null;
      const isActive = normalizeIsActive(it?.is_active, true);

      return {
        code,
        code_lc: code.toLowerCase(),
        name,
        category,
        normal_balance: normalBalance,
        is_active: isActive,
      };
    });

    // duplicate code in payload (case-insensitive)
    const seen = new Set();
    for (const it of normalized) {
      if (seen.has(it.code_lc)) {
        throw new InvariantError(`Duplicate code in payload: ${it.code}`);
      }
      seen.add(it.code_lc);
    }

    if (normalized.length === 0) {
      return {
        mode,
        source,
        template,
        created: 0,
        updated: 0,
        skipped: 0,
        items: [],
      };
    }

    return knex.transaction(async (trx) => {
      const codesLc = normalized.map((x) => x.code_lc);

      const existing = await trx("business_partners")
        .select("id", "code", "deleted_at")
        .where({ organization_id: organizationId })
        .whereIn(trx.raw("LOWER(code)"), codesLc);

      const existingByLc = new Map(
        existing.map((r) => [String(r.code || "").toLowerCase(), r])
      );

      if (mode === "insert_only") {
        const dup = normalized.find((x) => existingByLc.has(x.code_lc));
        if (dup) {
          const e = new InvariantError(
            `Business partner code already exists: ${dup.code}`
          );
          e.statusCode = 409;
          throw e;
        }
      }

      const resultItems = [];
      let created = 0;
      let updated = 0;

      for (const it of normalized) {
        const ex = existingByLc.get(it.code_lc);

        // defaults:
        const nb = normalizeNormalBalance(it.normal_balance, it.category);

        if (!ex) {
          const inserted = await trx("business_partners")
            .insert({
              organization_id: organizationId,
              code: it.code,
              name: it.name,
              category: it.category,
              normal_balance: nb,
              is_active: it.is_active,
              is_deleted: false,
              deleted_at: null,
              created_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            })
            .returning(["id"]);

          const id = inserted?.[0]?.id;
          created += 1;
          resultItems.push({ id, code: it.code, action: "created" });
          continue;
        }

        // upsert: update existing (including restoring soft-deleted)
        const patch = {
          code: it.code, // normalize to uppercase
          name: it.name,
          category: it.category,
          updated_at: trx.fn.now(),
        };

        // Only update optional fields if provided, else keep existing values.
        if (it.normal_balance !== null && it.normal_balance !== undefined) {
          patch.normal_balance = nb;
        }
        if (it.is_active !== undefined) {
          patch.is_active = it.is_active;
        }

        if (ex.deleted_at) {
          patch.is_deleted = false;
          patch.deleted_at = null;
        }

        await trx("business_partners")
          .where({ organization_id: organizationId, id: ex.id })
          .update(patch);

        updated += 1;
        resultItems.push({ id: ex.id, code: it.code, action: "updated" });
      }

      return {
        mode,
        source,
        template,
        created,
        updated,
        skipped: 0,
        items: resultItems,
      };
    });
  }
}

module.exports = BusinessPartnersService;
