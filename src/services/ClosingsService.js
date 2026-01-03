const crypto = require("crypto");

const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");
const NotFoundError = require("../exceptions/NotFoundError");

const isPostgres = () => knex?.client?.config?.client === "pg";

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

const toCents = (n) => Math.round(Number(n || 0) * 100);

const selectDateOnlyAsText = (qualifiedColumn, alias = "date") => {
  const client = knex?.client?.config?.client;

  if (client === "pg") {
    return knex.raw(`to_char(${qualifiedColumn}::date, 'YYYY-MM-DD') as ${alias}`);
  }

  if (client === "mysql" || client === "mysql2") {
    return knex.raw(`DATE_FORMAT(${qualifiedColumn}, '%Y-%m-%d') as ${alias}`);
  }

  return knex.raw(`${qualifiedColumn} as ${alias}`);
};

function normalBalanceFromAccount(account) {
  const nb = String(account?.normal_balance || "").toLowerCase();
  if (nb === "debit" || nb === "credit") return nb;

  const type = String(account?.type || "").toLowerCase();
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

function oppositePos(pos) {
  return pos === "debit" ? "credit" : "debit";
}

function posFromSigned(signed, normalPos) {
  return signed >= 0 ? normalPos : oppositePos(normalPos);
}

function signedFromSums({ debit, credit }, normalPos) {
  const d = Number(debit || 0);
  const c = Number(credit || 0);
  return normalPos === "debit" ? d - c : c - d;
}

function assertBalanced(lines) {
  const totalDebit = lines.reduce((sum, l) => sum + toCents(l.debit), 0);
  const totalCredit = lines.reduce((sum, l) => sum + toCents(l.credit), 0);

  if (totalDebit !== totalCredit) {
    throw new InvariantError(
      "Balance check failed: total debit must equal total credit"
    );
  }
  if (totalDebit <= 0) {
    throw new InvariantError("Balance check failed: totals must be > 0");
  }
}

class ClosingsService {
  async _resolveRetainedEarningsAccountForPreview({ organizationId }) {
    const preferredCode =
      String(process.env.RETAINED_EARNINGS_ACCOUNT_CODE || "3200").trim() ||
      "3200";

    const base = knex("accounts as a")
      .select(
        "a.id",
        "a.code",
        "a.name",
        "a.type",
        "a.normal_balance",
        "a.is_postable"
      )
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at")
      .andWhere("a.type", "equity")
      .andWhere("a.is_postable", true);

    const byCode = await base
      .clone()
      .andWhere("a.code", preferredCode)
      .first();
    if (byCode) return { account: byCode, source: "code" };

    const byName = await base
      .clone()
      .andWhere((qb) => {
        qb.whereILike("a.name", "%laba ditahan%")
          .orWhereILike("a.name", "%retained%earnings%")
          .orWhereILike("a.name", "%retained earnings%");
      })
      .orderBy("a.code", "asc")
      .first();
    if (byName) return { account: byName, source: "name" };

    const anyEquity = await base.clone().orderBy("a.code", "asc").first();
    if (anyEquity) return { account: anyEquity, source: "first_equity" };

    return { account: null, source: "missing", preferred_code: preferredCode };
  }

  async _buildYearEndClosingPreview({
    organizationId,
    year,
    closingDate,
    retainedEarningsAccount,
  }) {
    const y = String(year || "").trim();
    const fromDate = `${y}-01-01`;
    const toDate = String(closingDate || `${y}-12-31`).trim();

    // P&L balances for the year (posted only), excluding any closing entries
    const q = knex("journal_lines as jl")
      .join("journal_entries as je", "je.id", "jl.entry_id")
      .join("accounts as a", "a.id", "jl.account_id")
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhereRaw("COALESCE(je.entry_type, '') <> 'closing'")
      .andWhere("a.organization_id", organizationId)
      .whereNull("a.deleted_at")
      .whereIn("a.type", ["revenue", "expense"])
      .andWhere("a.is_postable", true)
      .andWhere((qb) => {
        if (isPostgres()) {
          qb.whereRaw("je.date::date >= ?::date AND je.date::date <= ?::date", [
            fromDate,
            toDate,
          ]);
          return;
        }

        qb.where("je.date", ">=", fromDate).andWhere("je.date", "<=", toDate);
      })
      .groupBy("a.id", "a.code", "a.name", "a.type", "a.normal_balance")
      .select(
        "a.id as account_id",
        "a.code",
        "a.name",
        "a.type",
        "a.normal_balance"
      )
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      )
      .orderBy("a.code", "asc")
      .orderBy("a.name", "asc");

    const rows = await q;

    const lines = [];
    let revenueTotal = 0;
    let expenseTotal = 0;

    for (const r of rows) {
      const debit = round2(r.sum_debit);
      const credit = round2(r.sum_credit);

      const normalPos = normalBalanceFromAccount(r);
      const signed = round2(signedFromSums({ debit, credit }, normalPos));
      if (toCents(signed) === 0) continue;

      const type = String(r.type || "").toLowerCase();
      if (type === "revenue") revenueTotal = round2(revenueTotal + signed);
      else if (type === "expense")
        expenseTotal = round2(expenseTotal + signed);

      const closingDelta = round2(-signed);

      // Build a line that negates the account's balance:
      // - normalPos=debit: delta = debit - credit
      // - normalPos=credit: delta = credit - debit
      let lineDebit = 0;
      let lineCredit = 0;

      if (normalPos === "debit") {
        lineDebit = closingDelta > 0 ? round2(Math.abs(closingDelta)) : 0;
        lineCredit = closingDelta < 0 ? round2(Math.abs(closingDelta)) : 0;
      } else {
        lineCredit = closingDelta > 0 ? round2(Math.abs(closingDelta)) : 0;
        lineDebit = closingDelta < 0 ? round2(Math.abs(closingDelta)) : 0;
      }

      if (toCents(lineDebit) === 0 && toCents(lineCredit) === 0) continue;

      lines.push({
        account_id: r.account_id,
        code: String(r.code || "").trim(),
        name: r.name,
        debit: lineDebit,
        credit: lineCredit,
        memo: `Close ${y} ${String(r.code || "").trim()} ${r.name || ""}`.trim(),
      });
    }

    revenueTotal = round2(revenueTotal);
    expenseTotal = round2(expenseTotal);
    const netIncome = round2(revenueTotal - expenseTotal);

    if (retainedEarningsAccount && toCents(netIncome) !== 0) {
      const abs = round2(Math.abs(netIncome));
      lines.push({
        account_id: retainedEarningsAccount.id,
        code: String(retainedEarningsAccount.code || "").trim(),
        name: retainedEarningsAccount.name,
        debit: netIncome < 0 ? abs : 0,
        credit: netIncome > 0 ? abs : 0,
        memo:
          netIncome >= 0
            ? `Retained earnings (profit) ${y} (preview)`
            : `Retained earnings (loss) ${y} (preview)`,
      });
    }

    const totalDebitCents = lines.reduce((sum, l) => sum + toCents(l.debit), 0);
    const totalCreditCents = lines.reduce(
      (sum, l) => sum + toCents(l.credit),
      0
    );

    const totalDebit = round2(totalDebitCents / 100);
    const totalCredit = round2(totalCreditCents / 100);

    if (lines.length > 0) assertBalanced(lines);

    return {
      closing_date: toDate,
      period: { from_date: fromDate, to_date: toDate },
      net_income: {
        amount: round2(Math.abs(netIncome)),
        side: netIncome >= 0 ? "credit" : "debit",
      },
      preview_entry: {
        entry_type: "closing",
        date: toDate,
        memo: "Year-end closing (preview)",
        lines,
        totals: { debit: totalDebit, credit: totalCredit },
      },
    };
  }

  async getYearEndStatus({ organizationId, year }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    const y = String(year || "").trim();
    if (!/^\d{4}$/.test(y)) throw new InvariantError("Invalid year");

    const nextYear = String(Number(y) + 1);
    const defaultClosingDate = `${y}-12-31`;

    const closing = await knex("journal_entries as je")
      .select("je.id", selectDateOnlyAsText("je.date", "date"), "je.posted_at")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.entry_type", "closing")
      .andWhere("je.closing_key", y)
      .first();

    const opening = await knex("journal_entries as je")
      .select("je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.entry_type", "opening")
      .andWhere("je.opening_key", nextYear)
      .first();

    const retainedResolved =
      await this._resolveRetainedEarningsAccountForPreview({ organizationId });

    const preview = await this._buildYearEndClosingPreview({
      organizationId,
      year: y,
      closingDate: defaultClosingDate,
      retainedEarningsAccount: retainedResolved.account,
    });

    return {
      year: y,
      next_year: nextYear,
      is_closed: !!closing,
      closing_entry_id: closing?.id || null,
      closing_date: closing?.date || null,
      opening_exists: !!opening,
      opening_entry_id: opening?.id || null,

      // Preview fields (Step 13)
      closing_date_default: defaultClosingDate,
      period: preview.period,
      retained_earnings_account: retainedResolved.account,
      retained_earnings_account_source: retainedResolved.source,
      net_income: preview.net_income,
      preview_entry: preview.preview_entry,
    };
  }

  async runYearEndClosing({
    organizationId,
    actorId,
    year,
    date = null,
    memo = null,
    retainedEarningsAccountId,
    generateOpening = true,
  }) {
    const y = String(year || "").trim();
    if (!/^\d{4}$/.test(y)) throw new InvariantError("Invalid year");
    const nextYear = String(Number(y) + 1);

    const toDate = String(date || `${y}-12-31`).trim();
    const fromDate = `${y}-01-01`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      throw new InvariantError("date must be YYYY-MM-DD");
    }
    if (!toDate.startsWith(`${y}-`)) {
      throw new InvariantError("date must be within the given year");
    }

    // Order of operations (atomic in one transaction):
    // 1) create closing entry
    // 2) insert closing lines
    // 3) lock period (accounting_period_locks)
    // 4) optional: generate opening next year
    return knex.transaction(async (trx) => {
      // Guard: existing closing for the year
      const existingClosing = await trx("journal_entries as je")
        .select("je.id")
        .where("je.organization_id", organizationId)
        .whereNull("je.deleted_at")
        .andWhere("je.entry_type", "closing")
        .andWhere("je.closing_key", y)
        .first();
      if (existingClosing) {
        throw new InvariantError(`Year ${y} is already closed`);
      }

      if (generateOpening) {
        const existingOpening = await trx("journal_entries as je")
          .select("je.id")
          .where("je.organization_id", organizationId)
          .whereNull("je.deleted_at")
          .andWhere("je.entry_type", "opening")
          .andWhere("je.opening_key", nextYear)
          .first();
        if (existingOpening) {
          throw new InvariantError(
            `Opening balance for "${nextYear}" already exists`
          );
        }
      }

      // Validate retained earnings account
      const retained = await trx("accounts as a")
        .select("a.id", "a.type", "a.is_postable")
        .where("a.organization_id", organizationId)
        .whereNull("a.deleted_at")
        .andWhere("a.id", retainedEarningsAccountId)
        .first();

      if (!retained) throw new NotFoundError("Retained earnings account not found");
      if (String(retained.type).toLowerCase() !== "equity") {
        throw new InvariantError("retained_earnings_account_id must be an equity account");
      }
      if (!retained.is_postable) {
        throw new InvariantError("retained_earnings_account_id must be a postable account");
      }

      // Aggregate revenue/expense for the period
      const plRows = await trx("journal_entries as je")
        .join("journal_lines as jl", "jl.entry_id", "je.id")
        .join("accounts as a", "a.id", "jl.account_id")
        .where("je.organization_id", organizationId)
        .whereNull("je.deleted_at")
        .andWhere("je.status", "posted")
        .andWhere("jl.organization_id", organizationId)
        .whereNull("jl.deleted_at")
        .andWhere("a.organization_id", organizationId)
        .whereNull("a.deleted_at")
        .whereIn("a.type", ["revenue", "expense"])
        .andWhere("je.date", ">=", fromDate)
        .andWhere("je.date", "<=", toDate)
        .groupBy("a.id", "a.code", "a.name", "a.type")
        .select("a.id as account_id", "a.code", "a.name", "a.type")
        .select(
          trx.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
          trx.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
        )
        .orderBy("a.code", "asc");

      let totalRevenue = 0;
      let totalExpense = 0;
      let closedAccountsCount = 0;

      const closingLines = [];

      for (const r of plRows) {
        const debit = round2(r.sum_debit);
        const credit = round2(r.sum_credit);
        if (toCents(debit) === 0 && toCents(credit) === 0) continue;

        const type = String(r.type || "").toLowerCase();

        // Signed balances for P&L accounts (period movement only):
        // - revenue  : credit - debit
        // - expense  : debit - credit
        const balance =
          type === "revenue" ? round2(credit - debit) : round2(debit - credit);
        if (toCents(balance) === 0) continue;

        closedAccountsCount += 1;

        if (type === "revenue") totalRevenue = round2(totalRevenue + balance);
        else totalExpense = round2(totalExpense + balance);

        // Closing line = reverse the balance so the account nets to zero.
        if (type === "revenue") {
          if (balance > 0) {
            closingLines.push({
              account_id: r.account_id,
              debit: round2(balance),
              credit: 0,
              memo: `Closing revenue ${r.code || ""} ${r.name || ""}`.trim(),
            });
          } else {
            closingLines.push({
              account_id: r.account_id,
              debit: 0,
              credit: round2(Math.abs(balance)),
              memo: `Closing revenue ${r.code || ""} ${r.name || ""}`.trim(),
            });
          }
        } else {
          // expense
          if (balance > 0) {
            closingLines.push({
              account_id: r.account_id,
              debit: 0,
              credit: round2(balance),
              memo: `Closing expense ${r.code || ""} ${r.name || ""}`.trim(),
            });
          } else {
            closingLines.push({
              account_id: r.account_id,
              debit: round2(Math.abs(balance)),
              credit: 0,
              memo: `Closing expense ${r.code || ""} ${r.name || ""}`.trim(),
            });
          }
        }
      }

      if (closingLines.length === 0) {
        throw new InvariantError("No revenue/expense balances to close for the period");
      }

      const netProfit = round2(totalRevenue - totalExpense); // profit >0, loss <0

      if (toCents(netProfit) !== 0) {
        if (netProfit > 0) {
          closingLines.push({
            account_id: retainedEarningsAccountId,
            debit: 0,
            credit: round2(netProfit),
            memo: `Retained earnings (profit) ${y}`.trim(),
          });
        } else {
          closingLines.push({
            account_id: retainedEarningsAccountId,
            debit: round2(Math.abs(netProfit)),
            credit: 0,
            memo: `Retained earnings (loss) ${y}`.trim(),
          });
        }
      }

      assertBalanced(closingLines);

      const now = trx.fn.now();
      const closingEntryId = crypto.randomUUID();

      try {
        await trx("journal_entries").insert({
          id: closingEntryId,
          organization_id: organizationId,
          date: toDate,
          memo: memo || `Year-end closing ${y}`,
          status: "posted",
          posted_at: now,
          posted_by: actorId,
          entry_type: "closing",
          closing_key: y,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        });
      } catch (e) {
        if (e?.code === "23505") {
          throw new InvariantError(`Year ${y} is already closed`);
        }
        throw e;
      }

      await trx("journal_lines").insert(
        closingLines.map((l) => ({
          id: crypto.randomUUID(),
          organization_id: organizationId,
          entry_id: closingEntryId,
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo || null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        }))
      );

      // Lock the closed period to prevent any further posting inside the closed range.
      // Overlap check: any closed lock that overlaps [periodStart..periodEnd] blocks closing.
      const periodStart = fromDate; // `${year}-01-01`
      const periodEnd = toDate;

      const overlappingLock = await trx("accounting_period_locks as pl")
        .select("pl.id", "pl.period_start", "pl.period_end")
        .where("pl.organization_id", organizationId)
        .whereNull("pl.deleted_at")
        .andWhere("pl.is_closed", true)
        .andWhere("pl.period_start", "<=", periodEnd)
        .andWhere("pl.period_end", ">=", periodStart)
        .first();

      if (overlappingLock) {
        throw new InvariantError("Period already locked/closed");
      }

      await trx("accounting_period_locks").insert({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        period_start: periodStart,
        period_end: periodEnd,
        is_closed: true,
        closed_at: now,
        closed_by: actorId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });

      let openingEntryId = null;
      let openingLinesCount = 0;

      if (generateOpening) {
        // Compute balance sheet balances up to toDate (inclusive), after closing is inserted.
        const bsRows = await trx("journal_entries as je")
          .join("journal_lines as jl", "jl.entry_id", "je.id")
          .join("accounts as a", "a.id", "jl.account_id")
          .where("je.organization_id", organizationId)
          .whereNull("je.deleted_at")
          .andWhere("je.status", "posted")
          .andWhere("jl.organization_id", organizationId)
          .whereNull("jl.deleted_at")
          .andWhere("a.organization_id", organizationId)
          .whereNull("a.deleted_at")
          .whereIn("a.type", ["asset", "liability", "equity"])
          .andWhere("a.is_postable", true)
          .andWhere("je.date", "<=", toDate)
          .groupBy("a.id", "a.code", "a.name", "a.type", "a.normal_balance")
          .select(
            "a.id as account_id",
            "a.code",
            "a.name",
            "a.type",
            "a.normal_balance"
          )
          .select(
            trx.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
            trx.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
          )
          .orderBy("a.code", "asc");

        const openingLines = [];

        for (const r of bsRows) {
          const debit = round2(r.sum_debit);
          const credit = round2(r.sum_credit);

          const normalPos = normalBalanceFromAccount(r);
          const signed = round2(
            signedFromSums({ debit, credit }, normalPos)
          );

          if (toCents(signed) === 0) continue;

          const pos = posFromSigned(signed, normalPos);
          const abs = round2(Math.abs(signed));

          openingLines.push({
            account_id: r.account_id,
            debit: pos === "debit" ? abs : 0,
            credit: pos === "credit" ? abs : 0,
            memo: `Opening ${nextYear} ${r.code || ""} ${r.name || ""}`.trim(),
          });
        }

        if (openingLines.length === 0) {
          throw new InvariantError("No balance sheet balances to generate opening");
        }

        assertBalanced(openingLines);

        openingEntryId = crypto.randomUUID();

        try {
          await trx("journal_entries").insert({
            id: openingEntryId,
            organization_id: organizationId,
            date: `${nextYear}-01-01`,
            memo: `Opening balance ${nextYear}`,
            status: "posted",
            posted_at: now,
            posted_by: actorId,
            entry_type: "opening",
            opening_key: nextYear,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });
        } catch (e) {
          if (e?.code === "23505") {
            throw new InvariantError(
              `Opening balance for "${nextYear}" already exists`
            );
          }
          throw e;
        }

        await trx("journal_lines").insert(
          openingLines.map((l) => ({
            id: crypto.randomUUID(),
            organization_id: organizationId,
            entry_id: openingEntryId,
            account_id: l.account_id,
            debit: l.debit,
            credit: l.credit,
            memo: l.memo || null,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          }))
        );

        openingLinesCount = openingLines.length;
      }

      return {
        year: y,
        next_year: nextYear,
        closing_entry_id: closingEntryId,
        opening_entry_id: openingEntryId,
        net_profit: netProfit,
        summary: {
          closed_accounts: closedAccountsCount,
          opening_lines: openingLinesCount,
        },
      };
    });
  }
}

module.exports = ClosingsService;
