const knex = require("../../database/knex");
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

const IDEM_SCOPE_POST = "journal_entries.post";

const toCents = (n) => Math.round(Number(n || 0) * 100);

class JournalEntriesService {
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
        "created_at",
        "updated_at"
      )
      .where({ organization_id: organizationId, id })
      .whereNull("deleted_at")
      .first();

    if (!entry) throw new NotFoundError("Journal entry not found");

    const lines = await knex("journal_lines")
      .select("id", "entry_id", "account_id", "debit", "credit", "memo")
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

        const rows = lines.map((l) => ({
          organization_id: organizationId,
          entry_id: entryId,
          account_id: l.account_id,
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

    const nextDate = payload.date ?? before.date;
    const nextMemo = payload.memo ?? before.memo;

    await knex.transaction(async (trx) => {
      await this._assertPeriodOpen({ organizationId, date: nextDate }, trx);

      // update header
      await trx("journal_entries")
        .where({ organization_id: organizationId, id })
        .whereNull("deleted_at")
        .update({
          date: nextDate,
          memo: nextMemo,
          updated_at: trx.fn.now(),
        });

      // replace lines (only if provided)
      if (payload.lines !== undefined) {
        const lines = Array.isArray(payload.lines) ? payload.lines : [];

        // hard replace (draft only)
        await trx("journal_lines")
          .where({ organization_id: organizationId, entry_id: id })
          .whereNull("deleted_at")
          .del();

        if (lines.length > 0) {
          await this._assertAccountsValid({ organizationId, lines }, trx);

          const rows = lines.map((l) => ({
            organization_id: organizationId,
            entry_id: id,
            account_id: l.account_id,
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

        // key exists but no response stored yet -> treat as in progress
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
        // already posted -> return success (idempotent behavior)
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
        .select("account_id", "debit", "credit")
        .where({ organization_id: organizationId, entry_id: id })
        .whereNull("deleted_at");

      if (!lines || lines.length < 2) {
        throw new InvariantError(
          "Journal entry must have at least 2 lines to post"
        );
      }

      // 5) validate accounts (must be postable, active, same org)
      await this._assertAccountsValid({ organizationId, lines }, trx);

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

    const reverseDate = payload?.date ?? original.date;
    const reverseMemo =
      payload?.memo ??
      `Reversal of ${original.id}${original.memo ? ` — ${original.memo}` : ""}`;

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
        // swap
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

      await trx("journal_lines").insert(reversedLines);

      payload.__createdId = newId; // internal
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
}

module.exports = JournalEntriesService;
