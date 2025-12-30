const knex = require("../../database/knex");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");
const { randomUUID } = require("node:crypto");

const normalBalanceByType = (type) => {
  if (type === "asset" || type === "expense") return "debit";
  return "credit";
};

const normalizeNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
};

const normalizeNullableBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  return !!value;
};

class AccountsService {
  async list({ orgId, page, limit, q, includeInactive = false }) {
    const offset = (page - 1) * limit;

    const base = knex("accounts")
      .where({ organization_id: orgId })
      .whereNull("deleted_at");

    if (!includeInactive) {
      base.andWhere({ is_active: true });
    }

    if (q) {
      const qq = `%${q}%`;
      base.andWhere((qb) => {
        qb.whereILike("code", qq)
          .orWhereILike("name", qq)
          .orWhereILike("type", qq);
      });
    }

    const totalRow = await base.clone().count("* as c").first();
    const total = Number(totalRow?.c ?? 0);

    const items = await base
      .clone()
      .select(
        "id",
        "code",
        "name",
        "type",
        "normal_balance",
        "cf_activity",
        "requires_bp",
        "subledger",
        "parent_id",
        "is_postable",
        "is_active",
        "created_at",
        "updated_at"
      )
      .orderBy("code", "asc")
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

  async options({ orgId, q = "", limit = 20, includeInactive = false }) {
    const base = knex("accounts")
      .where({ organization_id: orgId })
      .whereNull("deleted_at");

    if (!includeInactive) base.andWhere({ is_active: true });

    if (q) {
      const qq = `%${q}%`;
      base.andWhere((qb) => {
        qb.whereILike("code", qq).orWhereILike("name", qq);
      });
    }

    return base
      .select(
        "id",
        "code",
        "name",
        "type",
        "normal_balance",
        "cf_activity",
        "requires_bp",
        "subledger",
        "is_postable"
      )
      .orderBy("code", "asc")
      .limit(Math.min(Number(limit) || 20, 1000));
  }

  async getById({ organizationId, id }) {
    const row = await knex("accounts")
      .where({ organization_id: organizationId, id })
      .whereNull("deleted_at")
      .first();

    if (!row) throw new NotFoundError("Account not found");

    // ✅ sementara karena belum ada tabel transaksi
    // nanti kalau sudah ada journals/journal_lines, ganti jadi query exists
    return { ...row, has_transactions: false };
  }

  // ✅ parent harus valid + 1 org + tidak boleh self + tidak boleh cycle
  async _assertParentValid(
    { organizationId, id = null, parentId = null },
    trx
  ) {
    if (!parentId) return;

    if (id && parentId === id) {
      throw new InvariantError("parent_id cannot be the same as account id");
    }

    const db = trx || knex;

    // parent exists and same org
    const parent = await db("accounts")
      .where({ organization_id: organizationId, id: parentId })
      .whereNull("deleted_at")
      .first();

    if (!parent) throw new InvariantError("Parent account not found");

    // cycle check (walk up parent chain, max 50 steps)
    if (id) {
      let current = parent;
      let steps = 0;

      while (current?.parent_id) {
        steps += 1;
        if (steps > 50) {
          throw new InvariantError(
            "Parent hierarchy too deep (possible cycle)"
          );
        }
        if (current.parent_id === id) {
          throw new InvariantError("Invalid parent: would create a cycle");
        }

        current = await db("accounts")
          .where({ organization_id: organizationId, id: current.parent_id })
          .whereNull("deleted_at")
          .first();

        if (!current) break;
      }
    }
  }

  async softDelete({ organizationId, id }) {
    // ✅ prevent delete if has active children
    const child = await knex("accounts")
      .where({ organization_id: organizationId, parent_id: id })
      .whereNull("deleted_at")
      .first();

    if (child) {
      throw new InvariantError("Cannot delete: account has child accounts");
    }

    const updated = await knex("accounts")
      .where({ organization_id: organizationId, id })
      .whereNull("deleted_at")
      .update({
        deleted_at: knex.fn.now(),
        is_active: false,
        updated_at: knex.fn.now(),
      });

    if (!updated) {
      throw new NotFoundError("Account not found / already deleted");
    }
  }

  async create({ organizationId, payload }) {
    const type = payload.type;
    const normal_balance = normalBalanceByType(type);
    const cfActivity =
      payload.cf_activity !== undefined &&
      String(payload.cf_activity).trim() !== ""
        ? String(payload.cf_activity).trim()
        : null;
    const requiresBp =
      payload.requires_bp !== undefined ? !!payload.requires_bp : false;
    const subledger =
      payload.subledger !== undefined && String(payload.subledger).trim() !== ""
        ? String(payload.subledger).trim()
        : null;

    const id = await knex.transaction(async (trx) => {
      const newIdRow = await trx.raw("SELECT gen_random_uuid() AS id");
      const newId = newIdRow.rows[0].id;

      const parentId = payload.parent_id ?? null;

      await this._assertParentValid(
        { organizationId, id: newId, parentId },
        trx
      );

      try {
        await trx("accounts").insert({
          id: newId,
          organization_id: organizationId,
          code: payload.code,
          name: payload.name,
          type,
          normal_balance, // ✅ wajib supaya ga null (seed kamu kemarin error karena ini)
          cf_activity: cfActivity,
          requires_bp: requiresBp,
          subledger: subledger,
          parent_id: parentId,
          is_postable: payload.is_postable ?? false, // ✅ baru
          is_active: payload.is_active ?? true,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      } catch (e) {
        const isUnique =
          e?.code === "23505" ||
          e?.constraint === "accounts_org_code_unique" ||
          String(e?.message || "").includes("accounts_org_code_unique") ||
          String(e?.message || "").includes(
            "duplicate key value violates unique constraint"
          );

        if (isUnique) {
          const ie = new InvariantError(
            "Account code already exists in this organization"
          );
          ie.statusCode = 409;
          ie.error_code = "ACCOUNT_CODE_EXISTS";

          // carry original pg error for handler
          ie.cause = e;
          ie.pgCode = e?.code;
          ie.constraint = e?.constraint;

          throw ie;
        }

        throw e;
      }

      return newId;
    });

    return this.getById({ organizationId, id });
  }

  async restore({ organizationId, id }) {
    return knex.transaction(async (trx) => {
      const acc = await trx("accounts")
        .select("id", "deleted_at")
        .where({ organization_id: organizationId, id })
        .first();

      if (!acc) throw new NotFoundError("Account tidak ditemukan.");

      if (acc.deleted_at === null) return { id };

      await trx("accounts")
        .where({ organization_id: organizationId, id })
        .update({
          deleted_at: null,
          is_active: true,
          updated_at: trx.fn.now(),
        });

      return { id };
    });
  }

  async update({ organizationId, id, payload }) {
    const before = await this.getById({ organizationId, id });

    // ✅ COA mode: type tidak boleh berubah
    const nextType = before.type;
    const nextNormal = before.normal_balance; // atau normalBalanceByType(before.type)

    const nextParent =
      payload.parent_id === undefined ? before.parent_id : payload.parent_id;

    const nextCfActivity =
      payload.cf_activity === undefined
        ? before.cf_activity ?? null
        : String(payload.cf_activity || "").trim() || null;

    const nextRequiresBp =
      payload.requires_bp === undefined
        ? !!before.requires_bp
        : !!payload.requires_bp;

    const nextSubledger =
      payload.subledger === undefined
        ? before.subledger ?? null
        : String(payload.subledger || "").trim() || null;

    await knex.transaction(async (trx) => {
      await this._assertParentValid(
        { organizationId, id, parentId: nextParent ?? null },
        trx
      );

      // ✅ Guard is_postable based on has_transactions (sementara always false)
      // Nanti setelah ada tabel transaksi, isi hasTx dengan query exists
      const hasTx = false;

      const wantsChangePostable =
        payload.is_postable !== undefined &&
        typeof payload.is_postable === "boolean" &&
        payload.is_postable !== before.is_postable;

      if (hasTx && wantsChangePostable) {
        throw new InvariantError(
          "Cannot change postable setting because this account has transactions"
        );
      }

      try {
        const updated = await trx("accounts")
          .where({ organization_id: organizationId, id })
          .whereNull("deleted_at")
          .update({
            // ✅ COA mode: code tidak boleh berubah
            code: before.code,

            name: payload.name ?? before.name,

            // ✅ COA mode: type & normal_balance tidak boleh berubah
            type: nextType,
            normal_balance: nextNormal,

            parent_id: nextParent ?? null,

            cf_activity: nextCfActivity,
            requires_bp: nextRequiresBp,
            subledger: nextSubledger,

            is_postable:
              typeof payload.is_postable === "boolean"
                ? payload.is_postable
                : before.is_postable,

            is_active:
              typeof payload.is_active === "boolean"
                ? payload.is_active
                : before.is_active,

            updated_at: trx.fn.now(),
          });

        if (!updated) throw new NotFoundError("Account not found");
      } catch (e) {
        if (
          e?.code === "23505" ||
          String(e.message).includes("accounts_org_code_unique")
        ) {
          const ie = new InvariantError(
            "Account code already exists in this organization"
          );
          ie.statusCode = 409;
          ie.error_code = "ACCOUNT_CODE_EXISTS";
          ie.cause = e;
          throw ie;
        }
        throw e;
      }
    });

    const after = await this.getById({ organizationId, id });
    return { before, after };
  }

  async import({ orgId, mode = "upsert", accounts }) {
    const normalizedAccounts = (accounts || []).map((account) => {
      const code = normalizeNullableString(account.code);
      const name = normalizeNullableString(account.name);
      const type = normalizeNullableString(account.type);
      const parent_code = normalizeNullableString(account.parent_code);

      const cashFlowCategory = normalizeNullableString(
        account.cash_flow_category
      );
      const cf_activity = cashFlowCategory;

      const subledgerRaw = normalizeNullableString(account.subledger);
      const subledger = subledgerRaw ? subledgerRaw.toLowerCase() : null;

      const requiresBpFromPayload = normalizeNullableBoolean(
        account.requires_bp,
        false
      );
      const requires_bp =
        subledger === "ar" || subledger === "ap" ? true : requiresBpFromPayload;

      const is_postable =
        account.is_postable === undefined ? false : !!account.is_postable;

      return {
        code,
        name,
        type,
        parent_code: parent_code || null,
        is_postable,
        cf_activity: cf_activity || null,
        requires_bp,
        subledger: subledger || null,
        normal_balance: normalBalanceByType(type),
      };
    });

    const codes = normalizedAccounts.map((a) => a.code);
    const duplicates = codes.filter((code, idx) => codes.indexOf(code) !== idx);
    if (duplicates.length > 0) {
      throw new InvariantError(
        `Duplicate account code in payload: ${Array.from(
          new Set(duplicates)
        ).join(", ")}`
      );
    }

    const codeSet = new Set(codes);

    for (const acc of normalizedAccounts) {
      if (acc.parent_code && acc.parent_code === acc.code) {
        throw new InvariantError(
          `Invalid parent_code for account ${acc.code}: cannot be self`
        );
      }
    }

    const parentByCode = new Map(
      normalizedAccounts.map((a) => [a.code, a.parent_code])
    );
    const visiting = new Set();
    const visited = new Set();

    const visit = (code) => {
      if (visited.has(code)) return;
      if (visiting.has(code)) {
        throw new InvariantError(
          "Invalid parent_code: cycle detected in payload"
        );
      }

      visiting.add(code);
      const parentCode = parentByCode.get(code);
      if (parentCode && codeSet.has(parentCode)) visit(parentCode);
      visiting.delete(code);
      visited.add(code);
    };

    for (const code of codeSet) visit(code);

    return knex.transaction(async (trx) => {
      const parentCodes = normalizedAccounts
        .map((a) => a.parent_code)
        .filter(Boolean);

      const allCodes = Array.from(new Set([...codes, ...parentCodes]));

      const existingRows = await trx("accounts")
        .select("id", "code", "deleted_at")
        .where({ organization_id: orgId })
        .whereIn("code", allCodes);

      const existingByCode = new Map(existingRows.map((r) => [r.code, r]));

      // validate parent_code exists (payload or DB, and not soft-deleted)
      for (const acc of normalizedAccounts) {
        if (!acc.parent_code) continue;

        if (codeSet.has(acc.parent_code)) continue;

        const parentRow = existingByCode.get(acc.parent_code);
        if (!parentRow || parentRow.deleted_at) {
          throw new InvariantError(
            `parent_code not found for account ${acc.code}: ${acc.parent_code}`
          );
        }
      }

      let created = 0;
      let updated = 0;
      const skipped = 0;

      // step 1: upsert/insert without parent_id
      for (const acc of normalizedAccounts) {
        const existing = existingByCode.get(acc.code);

        if (!existing) {
          await trx("accounts").insert({
            id: randomUUID(),
            organization_id: orgId,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            normal_balance: acc.normal_balance,
            cf_activity: acc.cf_activity,
            requires_bp: acc.requires_bp,
            subledger: acc.subledger,
            parent_id: null,
            is_postable: acc.is_postable,
            is_active: true,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
          created += 1;
          continue;
        }

        if (existing.deleted_at) {
          const ie = new InvariantError(
            `Account code already exists but is soft-deleted: ${acc.code}`
          );
          ie.statusCode = 409;
          ie.error_code = "ACCOUNT_SOFT_DELETED";
          throw ie;
        }

        if (mode === "insert_only") {
          const ie = new InvariantError(
            `Account code already exists in this organization: ${acc.code}`
          );
          ie.statusCode = 409;
          ie.error_code = "ACCOUNT_CODE_EXISTS";
          throw ie;
        }

        await trx("accounts")
          .where({ organization_id: orgId, code: acc.code })
          .whereNull("deleted_at")
          .update({
            name: acc.name,
            type: acc.type,
            normal_balance: acc.normal_balance,
            cf_activity: acc.cf_activity,
            requires_bp: acc.requires_bp,
            subledger: acc.subledger,
            is_postable: acc.is_postable,
            updated_at: trx.fn.now(),
          });
        updated += 1;
      }

      // step 2: map code -> id for payload + parent refs
      const codeToIdRows = await trx("accounts")
        .select("id", "code")
        .where({ organization_id: orgId })
        .whereIn("code", allCodes)
        .whereNull("deleted_at");

      const codeToId = new Map(codeToIdRows.map((r) => [r.code, r.id]));

      // step 3: set parent_id based on parent_code
      for (const acc of normalizedAccounts) {
        const id = codeToId.get(acc.code);
        const parentId = acc.parent_code ? codeToId.get(acc.parent_code) : null;

        if (!id) {
          throw new InvariantError(
            `Account not found after import: ${acc.code}`
          );
        }

        if (acc.parent_code && !parentId) {
          throw new InvariantError(
            `parent_code not found after import for account ${acc.code}: ${acc.parent_code}`
          );
        }

        await this._assertParentValid(
          { organizationId: orgId, id, parentId: parentId ?? null },
          trx
        );

        await trx("accounts")
          .where({ organization_id: orgId, id })
          .whereNull("deleted_at")
          .update({ parent_id: parentId ?? null, updated_at: trx.fn.now() });
      }

      return { created, updated, skipped };
    });
  }

  async findByCodeAny({ organizationId, code }, trx = null) {
    const db = trx || knex;

    return db("accounts")
      .select(
        "id",
        "code",
        "name",
        "type",
        "parent_id",
        "is_postable",
        "is_active",
        "deleted_at"
      )
      .where({ organization_id: organizationId, code })
      .first();
  }
}

module.exports = AccountsService;
