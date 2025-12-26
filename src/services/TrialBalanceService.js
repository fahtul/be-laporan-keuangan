const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");

function oppositePos(pos) {
  return pos === "debit" ? "credit" : "debit";
}

function posFromSigned(signed, normalPos) {
  return signed >= 0 ? normalPos : oppositePos(normalPos);
}

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function signedFromSums({ debit, credit }, normalPos) {
  const d = Number(debit || 0);
  const c = Number(credit || 0);
  return normalPos === "debit" ? d - c : c - d;
}

function normalBalanceFromAccount(account) {
  const nb = String(account?.normal_balance || "").toLowerCase();
  if (nb === "debit" || nb === "credit") return nb;

  const type = String(account?.type || "").toLowerCase();
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

class TrialBalanceService {
  async getTrialBalance({
    organizationId,
    fromDate,
    toDate,
    includeZero = false,
    includeHeader = false,
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    // A) accounts
    const accountsQ = knex("accounts as a")
      .select("a.id", "a.code", "a.name", "a.type", "a.normal_balance")
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at");

    if (!includeHeader) accountsQ.andWhere("a.is_postable", true);

    const accounts = await accountsQ.orderBy("a.code", "asc").orderBy("a.name");
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    // B) opening sums (< fromDate)
    const openingRows = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("je.date", "<", fromDate)
      .groupBy("jl.account_id")
      .select("jl.account_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    // C) mutation sums (between)
    const mutationRows = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("je.date", ">=", fromDate)
      .andWhere("je.date", "<=", toDate)
      .groupBy("jl.account_id")
      .select("jl.account_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    const openingByAccountId = new Map(
      openingRows.map((r) => [
        r.account_id,
        { debit: round2(r.sum_debit), credit: round2(r.sum_credit) },
      ])
    );

    const mutationByAccountId = new Map(
      mutationRows.map((r) => [
        r.account_id,
        { debit: round2(r.sum_debit), credit: round2(r.sum_credit) },
      ])
    );

    // D) merge + compute closing
    const items = [];

    for (const a of accounts) {
      const normalPos = normalBalanceFromAccount(a);

      const openingSum = openingByAccountId.get(a.id) || { debit: 0, credit: 0 };
      const mutation = mutationByAccountId.get(a.id) || { debit: 0, credit: 0 };

      const openingSigned = round2(signedFromSums(openingSum, normalPos));
      const openingPos = posFromSigned(openingSigned, normalPos);
      const openingAbs = round2(Math.abs(openingSigned));
      const opening = {
        debit: openingPos === "debit" ? openingAbs : 0,
        credit: openingPos === "credit" ? openingAbs : 0,
      };

      const mutationDebit = round2(mutation.debit);
      const mutationCredit = round2(mutation.credit);
      const mutationSigned = round2(
        signedFromSums({ debit: mutationDebit, credit: mutationCredit }, normalPos)
      );

      const closingSigned = round2(openingSigned + mutationSigned);
      const closingPos = posFromSigned(closingSigned, normalPos);
      const closingAbs = round2(Math.abs(closingSigned));

      const closing = {
        debit: closingPos === "debit" ? closingAbs : 0,
        credit: closingPos === "credit" ? closingAbs : 0,
      };

      if (
        !includeZero &&
        openingAbs === 0 &&
        mutationDebit === 0 &&
        mutationCredit === 0 &&
        closingAbs === 0
      ) {
        continue;
      }

      items.push({
        account_id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        normal_balance: normalPos,
        opening,
        mutation: { debit: mutationDebit, credit: mutationCredit },
        closing,
        closing_balance: closingAbs,
        closing_pos: closingPos,
      });
    }

    // E) totals (from items, not raw aggs)
    const totals = {
      opening_debit: 0,
      opening_credit: 0,
      mutation_debit: 0,
      mutation_credit: 0,
      closing_debit: 0,
      closing_credit: 0,
    };

    for (const it of items) {
      totals.opening_debit += Number(it.opening.debit || 0);
      totals.opening_credit += Number(it.opening.credit || 0);
      totals.mutation_debit += Number(it.mutation.debit || 0);
      totals.mutation_credit += Number(it.mutation.credit || 0);
      totals.closing_debit += Number(it.closing.debit || 0);
      totals.closing_credit += Number(it.closing.credit || 0);
    }

    Object.keys(totals).forEach((k) => {
      totals[k] = round2(totals[k]);
    });

    // F) stable sort (service-level, in case DB collation differs)
    items.sort((a, b) => {
      const c = String(a.code || "").localeCompare(String(b.code || ""), "en", {
        numeric: true,
      });
      if (c !== 0) return c;
      return String(a.name || "").localeCompare(String(b.name || ""), "en");
    });

    return {
      period: { from_date: fromDate, to_date: toDate },
      items,
      totals,
    };
  }
}

module.exports = TrialBalanceService;

