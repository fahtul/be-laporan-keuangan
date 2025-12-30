const knex = require("../../database/knex");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

const IDEM_SCOPE_POST = "journal_entries.post";
const toCents = (n) => Math.round(Number(n || 0) * 100);

class JournalEntriesService {
  // ========== List ==========
  async list({
    organizationId,
    page,
    limit,
    q = "",
    status = "",
    fromDate = null,
    toDate = null,
  }) {
    const offset = (page - 1) * limit;

    const base = knex("journal_entries as je")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at");

    if (status) base.andWhere("je.status", status);

    if (fromDate) base.andWhere("je.date", ">=", fromDate);
    if (toDate) base.andWhere("je.date", "<=", toDate);

    if (q) {
      const qq = `%${q}%`;
      base.andWhere((qb) => {
        qb.whereILike("je.memo", qq)
          .orWhereILike("je.id", qq)
          .orWhereILike("je.status", qq);
      });
    }

    const totalRow = await base.clone().count("* as c").first();
    const total = Number(totalRow?.c ?? 0);

    // aggregate totals per entry
    const agg = knex("journal_lines as jl")
      .select("jl.entry_id")
      .sum({ total_debit: "jl.debit" })
      .sum({ total_credit: "jl.credit" })
      .count({ lines_count: "*" })
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .groupBy("jl.entry_id")
      .as("agg");

    const items = await base
      .clone()
      .leftJoin(agg, "agg.entry_id", "je.id")
      .select(
        "je.id",
        "je.date",
        "je.memo",
        "je.status",
        "je.posted_at",
        "je.posted_by",
        "je.reversal_of_id",
        "je.created_at",
        "je.updated_at",
        knex.raw("COALESCE(agg.total_debit, 0) as total_debit"),
        knex.raw("COALESCE(agg.total_credit, 0) as total_credit"),
        knex.raw("COALESCE(agg.lines_count, 0) as lines_count")
      )
      .orderBy("je.date", "desc")
      .orderBy("je.created_at", "desc")
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
        status,
        fromDate,
        toDate,
      },
    };
  }

  // ========== Read ==========
  async getById({ organizationId, id }) {
    const entry = await knex("journal_entries")
      .select(
        "id",
        "organization_id",
        "date",
        "memo",
        "status",
        "posted_at",
        "posted_by",
        "entry_type",
        "reversal_of_id",
        "created_at",
        "updated_at"
      )
      .where({ organization_id: organizationId, id })
      .whereNull("deleted_at")
      .first();

    if (!entry) throw new NotFoundError("Journal entry not found");

    const lines = await knex("journal_lines")
      .select("id", "entry_id", "account_id", "bp_id", "debit", "credit", "memo")
      .where({ organization_id: organizationId, entry_id: id })
      .whereNull("deleted_at")
      .orderBy("created_at", "asc");

    return { ...entry, lines };
  }

  // ========== Create Draft ==========
  async create({ organizationId, actorId, payload }) {
    const date = payload.date;
    const memo = payload.memo ?? null;
    const lines = Array.isArray(payload.lines) ? payload.lines : null;

    await knex.transaction(async (trx) => {
      await this._assertPeriodOpen({ organizationId, date }, trx);

      const [created] = await trx("journal_entries")
        .insert({
          organization_id: organizationId,
          date,
          memo,
          status: "draft",
          posted_at: null,
          posted_by: null,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning(["id"]);

      const entryId = created?.id;
      if (!entryId) throw new InvariantError("Failed to create journal entry");

      if (lines && lines.length > 0) {
        await this._assertAccountsValid({ organizationId, lines }, trx);
        await this._assertBusinessPartnersValid({ organizationId, lines }, trx);
        await this._assertBpRequiredByAccounts({ organizationId, lines }, trx);

        const rows = lines.map((l) => ({
          organization_id: organizationId,
          entry_id: entryId,
          account_id: l.account_id,
          bp_id: l.bp_id ? String(l.bp_id).trim() || null : null,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo ?? null,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        }));

        await trx("journal_lines").insert(rows);
      }

      payload.__createdId = entryId; // internal
    });

    return this.getById({ organizationId, id: payload.__createdId });
  }

  // ========== Update Draft ==========
  async update({ organizationId, id, payload }) {
    const before = await this.getById({ organizationId, id });

    if (before.status !== "draft") {
      throw new InvariantError("Posted/void journal entries cannot be edited");
    }

    const isReversal = !!before.reversal_of_id;
    let skipLinesUpdate = false;

    // ✅ Pengaman: reversing entry lines tidak boleh berubah
    if (isReversal && payload.lines !== undefined) {
      const same = this._isSameLines(before.lines, payload.lines);
      if (!same) {
        throw new InvariantError(
          "Lines pada reversing entry tidak boleh diubah. Buat journal koreksi baru jika perlu."
        );
      }
      // lines sama persis → kita abaikan update lines (biar tidak terhapus & insert ulang)
      skipLinesUpdate = true;
    }

    const nextDate = payload.date ?? before.date;
    const nextMemo = payload.memo ?? before.memo;

    await knex.transaction(async (trx) => {
      await this._assertPeriodOpen({ organizationId, date: nextDate }, trx);

      await trx("journal_entries")
        .where({ organization_id: organizationId, id })
        .whereNull("deleted_at")
        .update({
          date: nextDate,
          memo: nextMemo,
          updated_at: trx.fn.now(),
        });

      if (!skipLinesUpdate && payload.lines !== undefined) {
        const lines = Array.isArray(payload.lines) ? payload.lines : [];

        // hard replace (draft only)
        await trx("journal_lines")
          .where({ organization_id: organizationId, entry_id: id })
          .whereNull("deleted_at")
          .del();

        if (lines.length > 0) {
          await this._assertAccountsValid({ organizationId, lines }, trx);
          await this._assertBusinessPartnersValid({ organizationId, lines }, trx);
          await this._assertBpRequiredByAccounts({ organizationId, lines }, trx);

          const rows = lines.map((l) => ({
            organization_id: organizationId,
            entry_id: id,
            account_id: l.account_id,
            bp_id: l.bp_id ? String(l.bp_id).trim() || null : null,
            debit: l.debit,
            credit: l.credit,
            memo: l.memo ?? null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          }));

          await trx("journal_lines").insert(rows);
        }
      }
    });

    const after = await this.getById({ organizationId, id });
    return { before, after };
  }

  // ========== Post ==========
  async post({ organizationId, id, actorId, idempotencyKey }) {
    if (!idempotencyKey) {
      throw new InvariantError("Idempotency-Key header is required");
    }

    return knex.transaction(async (trx) => {
      // 1) idempotency lock
      const inserted = await trx("idempotency_keys")
        .insert({
          organization_id: organizationId,
          scope: IDEM_SCOPE_POST,
          idempotency_key: idempotencyKey,
          request_hash: null,
          response_status: null,
          response_body: null,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .onConflict(["organization_id", "scope", "idempotency_key"])
        .ignore()
        .returning(["id"]);

      if (!inserted || inserted.length === 0) {
        const prev = await trx("idempotency_keys")
          .where({
            organization_id: organizationId,
            scope: IDEM_SCOPE_POST,
            idempotency_key: idempotencyKey,
          })
          .first();

        if (prev?.response_body) {
          return {
            replay: true,
            responseStatus: prev.response_status || 200,
            responseBody: prev.response_body,
          };
        }

        throw new InvariantError("Request is already being processed");
      }

      // 2) lock entry row
      const entry = await trx("journal_entries")
        .where({ organization_id: organizationId, id })
        .whereNull("deleted_at")
        .forUpdate()
        .first();

      if (!entry) throw new NotFoundError("Journal entry not found");

      if (entry.status === "posted") {
        const data = await this.getById({ organizationId, id });
        const body = { status: "success", data };

        await trx("idempotency_keys")
          .where({
            organization_id: organizationId,
            scope: IDEM_SCOPE_POST,
            idempotency_key: idempotencyKey,
          })
          .update({
            response_status: 200,
            response_body: body,
            updated_at: trx.fn.now(),
          });

        return { replay: false, entry: data };
      }

      if (entry.status !== "draft") {
        throw new InvariantError("Only draft entries can be posted");
      }

      // 3) period lock
      await this._assertPeriodOpen({ organizationId, date: entry.date }, trx);

      // 4) load lines
      const lines = await trx("journal_lines")
        .select("account_id", "bp_id", "debit", "credit")
        .where({ organization_id: organizationId, entry_id: id })
        .whereNull("deleted_at");

      if (!lines || lines.length < 2) {
        throw new InvariantError(
          "Journal entry must have at least 2 lines to post"
        );
      }

      // 5) validate accounts
      await this._assertAccountsValid({ organizationId, lines }, trx);
      await this._assertBusinessPartnersValid({ organizationId, lines }, trx);
      await this._assertBpRequiredByAccounts({ organizationId, lines }, trx);

      // 6) balance check
      this._assertBalanced(lines);

      // 7) mark posted
      await trx("journal_entries")
        .where({ organization_id: organizationId, id })
        .whereNull("deleted_at")
        .update({
          status: "posted",
          posted_at: trx.fn.now(),
          posted_by: actorId,
          updated_at: trx.fn.now(),
        });

      const after = await this.getById({ organizationId, id });

      // 8) store idempotent response
      const body = { status: "success", data: after };
      await trx("idempotency_keys")
        .where({
          organization_id: organizationId,
          scope: IDEM_SCOPE_POST,
          idempotency_key: idempotencyKey,
        })
        .update({
          response_status: 200,
          response_body: body,
          updated_at: trx.fn.now(),
        });

      return { replay: false, entry: after };
    });
  }

  // ========== Reverse ==========
  async reverse({ organizationId, id, actorId, payload }) {
    const original = await this.getById({ organizationId, id });

    if (original.status !== "posted") {
      throw new InvariantError("Only posted entries can be reversed");
    }

    if (original.entry_type === "closing" || original.entry_type === "opening") {
      throw new InvariantError("Closing/Opening entries cannot be reversed");
    }

    const reverseDate = payload?.date ?? original.date;
    const reverseMemo =
      payload?.memo ??
      `Reversal of ${original.id}${original.memo ? ` - ${original.memo}` : ""}`;

    await knex.transaction(async (trx) => {
      await this._assertPeriodOpen({ organizationId, date: reverseDate }, trx);

      const [created] = await trx("journal_entries")
        .insert({
          organization_id: organizationId,
          date: reverseDate,
          memo: reverseMemo,
          status: "draft",
          posted_at: null,
          posted_by: null,
          reversal_of_id: original.id,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning(["id"]);

      const newId = created?.id;
      if (!newId) throw new InvariantError("Failed to create reversing entry");

      const reversedLines = (original.lines || []).map((l) => ({
        organization_id: organizationId,
        entry_id: newId,
        account_id: l.account_id,
        bp_id: l.bp_id ? String(l.bp_id).trim() || null : null,
        debit: l.credit,
        credit: l.debit,
        memo: l.memo ?? null,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      }));

      if (reversedLines.length < 2) {
        throw new InvariantError(
          "Original entry has insufficient lines to reverse"
        );
      }

      await this._assertAccountsValid(
        { organizationId, lines: reversedLines },
        trx
      );
      await this._assertBusinessPartnersValid(
        { organizationId, lines: reversedLines },
        trx
      );
      await this._assertBpRequiredByAccounts(
        { organizationId, lines: reversedLines },
        trx
      );
      await trx("journal_lines").insert(reversedLines);

      payload.__createdId = newId;
    });

    return this.getById({ organizationId, id: payload.__createdId });
  }

  // ========== Helpers ==========
  _assertBalanced(lines) {
    const totalDebit = lines.reduce((sum, l) => sum + toCents(l.debit), 0);
    const totalCredit = lines.reduce((sum, l) => sum + toCents(l.credit), 0);

    if (totalDebit !== totalCredit) {
      throw new InvariantError(
        "Balance check failed: total debit must equal total credit"
      );
    }
    if (totalDebit <= 0) {
      throw new InvariantError(
        "Balance check failed: totals must be greater than 0"
      );
    }
  }

  async _assertPeriodOpen({ organizationId, date }, trx) {
    const db = trx || knex;

    const locked = await db("accounting_period_locks")
      .where({ organization_id: organizationId, is_closed: true })
      .whereNull("deleted_at")
      .andWhere("period_start", "<=", date)
      .andWhere("period_end", ">=", date)
      .first();

    if (locked) {
      throw new InvariantError("Period is closed for the given date");
    }
  }

  async _assertAccountsValid({ organizationId, lines }, trx) {
    const db = trx || knex;

    const ids = Array.from(
      new Set((lines || []).map((l) => l.account_id).filter(Boolean))
    );

    if (ids.length === 0) {
      throw new InvariantError("Journal lines must include account_id");
    }

    const accounts = await db("accounts")
      .select("id", "is_postable", "is_active")
      .where({ organization_id: organizationId })
      .whereNull("deleted_at")
      .whereIn("id", ids);

    if (accounts.length !== ids.length) {
      throw new InvariantError("One or more accounts not found");
    }

    for (const a of accounts) {
      if (!a.is_active) throw new InvariantError("Account is inactive");
      if (!a.is_postable) throw new InvariantError("Account is not postable");
    }
  }

  async _assertBusinessPartnersValid({ organizationId, lines }, trx) {
    const db = trx || knex;

    const ids = Array.from(
      new Set(
        (lines || [])
          .map((l) => (l.bp_id === "" || l.bp_id === undefined ? null : l.bp_id))
          .filter(Boolean)
          .map((x) => String(x).trim())
          .filter(Boolean)
      )
    );

    if (ids.length === 0) return;

    const rows = await db("business_partners")
      .select("id")
      .where({
        organization_id: organizationId,
        is_deleted: false,
        is_active: true,
      })
      .whereNull("deleted_at")
      .whereIn("id", ids);

    if (rows.length !== ids.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new InvariantError(
        `Business partner not found: ${missing.slice(0, 10).join(", ")}`
      );
    }
  }

  async _assertBpRequiredByAccounts({ organizationId, lines }, trx) {
    const db = trx || knex;

    const accountIds = Array.from(
      new Set((lines || []).map((l) => l.account_id).filter(Boolean))
    );
    if (accountIds.length === 0) return;

    const accounts = await db("accounts")
      .select("id", "code", "requires_bp", "subledger")
      .where({ organization_id: organizationId })
      .whereNull("deleted_at")
      .whereIn("id", accountIds);

    const byId = new Map(accounts.map((a) => [a.id, a]));

    for (const l of lines || []) {
      const acc = byId.get(l.account_id);
      if (!acc) continue;

      if (!acc.requires_bp) continue;

      const bpId = l.bp_id ? String(l.bp_id).trim() : "";
      if (!bpId) {
        const code = acc.code ? ` (${acc.code})` : "";
        throw new InvariantError(
          `Line for account ${acc.id}${code} requires business partner`
        );
      }
    }
  }

  _normalizeLinesForCompare(lines) {
    const arr = Array.isArray(lines) ? lines : [];

    return (
      arr
        .map((l) => ({
          account_id: String(l.account_id || ""),
          bp_id:
            l.bp_id === "" || l.bp_id === undefined
              ? null
              : String(l.bp_id || ""),
          debit_cents: toCents(l.debit),
          credit_cents: toCents(l.credit),
          memo: l.memo === "" || l.memo === undefined ? null : l.memo ?? null,
        }))
        // sort biar perbandingan stabil walau urutan beda
        .sort((a, b) => {
          const ak = `${a.account_id}|${a.bp_id ?? ""}|${a.debit_cents}|${
            a.credit_cents
          }|${a.memo ?? ""}`;
          const bk = `${b.account_id}|${b.bp_id ?? ""}|${b.debit_cents}|${
            b.credit_cents
          }|${b.memo ?? ""}`;
          return ak.localeCompare(bk);
        })
    );
  }

  _isSameLines(aLines, bLines) {
    const a = this._normalizeLinesForCompare(aLines);
    const b = this._normalizeLinesForCompare(bLines);

    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (a[i].account_id !== b[i].account_id) return false;
      if ((a[i].bp_id ?? null) !== (b[i].bp_id ?? null)) return false;
      if (a[i].debit_cents !== b[i].debit_cents) return false;
      if (a[i].credit_cents !== b[i].credit_cents) return false;
      if ((a[i].memo ?? null) !== (b[i].memo ?? null)) return false;
    }
    return true;
  }

  async getOpeningByKey({ organizationId, openingKey }) {
    const entry = await knex("journal_entries as je")
      .select(
        "je.id",
        "je.organization_id",
        "je.date",
        "je.memo",
        "je.status",
        "je.posted_at",
        "je.posted_by",
        "je.entry_type",
        "je.opening_key",
        "je.source_entry_id", // pastikan kolom ini memang ada (hasil migration)
        "je.created_at",
        "je.updated_at"
      )
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.entry_type", "opening")
      .andWhere("je.opening_key", openingKey)
      .first();

    if (!entry) return null;

    const lines = await knex("journal_lines as jl")
      .select(
        "jl.id",
        "jl.entry_id",
        "jl.account_id",
        "jl.bp_id",
        "jl.debit",
        "jl.credit",
        "jl.memo"
      )
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.entry_id", entry.id)
      .orderBy("jl.created_at", "asc");

    return { ...entry, lines };
  }

  async createOpeningBalance({ organizationId, actorId, payload }) {
    const date = payload.date;
    const memo = payload.memo ?? null;
    const openingKey = String(payload.opening_key || "").trim();
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (!openingKey) throw new InvariantError("opening_key is required");
    if (lines.length < 2)
      throw new InvariantError("Opening balance must have at least 2 lines");

    // cek existing (aplikasi guard) — unique index tetap jadi guard utama
    const existing = await knex("journal_entries as je")
      .select("je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.entry_type", "opening")
      .andWhere("je.opening_key", openingKey)
      .first();

    if (existing) {
      throw new InvariantError(
        `Opening balance for "${openingKey}" already exists`
      );
    }

    let entryId = null;

    await knex.transaction(async (trx) => {
      await this._assertPeriodOpen({ organizationId, date }, trx);
      await this._assertAccountsValid({ organizationId, lines }, trx);
      await this._assertBusinessPartnersValid({ organizationId, lines }, trx);
      await this._assertBpRequiredByAccounts({ organizationId, lines }, trx);

      // harus balance sebelum insert
      this._assertBalanced(lines);

      // insert header
      const inserted = await trx("journal_entries")
        .insert({
          organization_id: organizationId,
          date,
          memo,
          status: "posted",
          posted_at: trx.fn.now(),
          posted_by: actorId,
          entry_type: "opening",
          opening_key: openingKey,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning(["id"]); // di PG: [{id}], di MySQL biasanya returning di-ignore dan insert() balikin [id]

      const first = Array.isArray(inserted) ? inserted[0] : inserted;
      entryId = typeof first === "object" ? first?.id : first;

      if (!entryId)
        throw new InvariantError("Failed to create opening balance");

      // insert lines
      const rows = lines.map((l) => ({
        organization_id: organizationId,
        entry_id: entryId,
        account_id: l.account_id,
        bp_id: l.bp_id ? String(l.bp_id).trim() || null : null,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        memo: l.memo ?? null,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      }));

      await trx("journal_lines").insert(rows);
    });

    return this.getById({ organizationId, id: entryId });
  }
}

module.exports = JournalEntriesService;
