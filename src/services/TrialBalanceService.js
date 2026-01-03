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
    if (!fromDate || !toDate) {
      throw new InvariantError("from_date and to_date are required");
    }

    // string compare aman untuk YYYY-MM-DD
    if (String(fromDate) > String(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    // Postgres date-only compare
    const DATE_ONLY = "je.date::date";

    const fromYmd = String(fromDate).trim();
    const toYmd = String(toDate).trim();

    // kita support special policy hanya kalau range 1 tahun (umumnya UI kamu "Tahun")
    const sameYear = fromYmd.slice(0, 4) === toYmd.slice(0, 4);
    const year = fromYmd.slice(0, 4);
    const yearStart = `${year}-01-01`;

    // A) Accounts
    const accountsQ = knex("accounts as a")
      .select(
        "a.id",
        "a.code",
        "a.name",
        "a.type",
        "a.normal_balance",
        "a.is_postable"
      )
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at");

    if (!includeHeader) accountsQ.andWhere("a.is_postable", true);

    const accounts = await accountsQ
      .orderBy("a.code", "asc")
      .orderBy("a.name", "asc");

    // B) Detect opening entry for this year (posted, not deleted) on yearStart
    let hasYearOpening = false;

    if (sameYear) {
      const openingRow = await knex("journal_entries as je")
        .where("je.organization_id", organizationId)
        .whereNull("je.deleted_at")
        .andWhere("je.status", "posted")
        .andWhere("je.entry_type", "opening")
        .andWhereRaw(`${DATE_ONLY} = ?::date`, [yearStart])
        .first("je.id");

      hasYearOpening = !!openingRow;
    }

    // Policy:
    // - kalau opening entry tahun itu ada, jadikan itu baseline (jangan ikut akumulasi transaksi sebelum yearStart)
    const useOpeningBaseline = sameYear && hasYearOpening;

    // C) Opening sums
    // - default: all posted < fromDate
    // - baseline mode:
    //   - kalau fromDate == yearStart: opening = opening entries on yearStart
    //   - kalau fromDate > yearStart: opening = all posted from yearStart .. < fromDate (termasuk opening entry)
    const openingRowsQ = knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .groupBy("jl.account_id")
      .select("jl.account_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    if (useOpeningBaseline) {
      if (fromYmd === yearStart) {
        // opening = opening entry di yearStart saja
        openingRowsQ
          .andWhere("je.entry_type", "opening")
          .andWhereRaw(`${DATE_ONLY} = ?::date`, [yearStart]);
      } else {
        // opening = semua transaksi dari awal tahun sampai sebelum fromDate
        openingRowsQ
          .andWhereRaw(`${DATE_ONLY} >= ?::date`, [yearStart])
          .andWhereRaw(`${DATE_ONLY} < ?::date`, [fromYmd]);
      }
    } else {
      openingRowsQ.andWhereRaw(`${DATE_ONLY} < ?::date`, [fromYmd]);
    }

    const openingRows = await openingRowsQ;

    // D) Mutation sums
    // - always: fromDate..toDate
    // - baseline mode: (kalau fromDate == yearStart) exclude opening entry di yearStart biar gak dobel
    const mutationRowsQ = knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhereRaw(`${DATE_ONLY} >= ?::date`, [fromYmd])
      .andWhereRaw(`${DATE_ONLY} <= ?::date`, [toYmd])
      .groupBy("jl.account_id")
      .select("jl.account_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    if (useOpeningBaseline && fromYmd === yearStart) {
      mutationRowsQ.andWhereRaw(
        `NOT (je.entry_type = 'opening' AND ${DATE_ONLY} = ?::date)`,
        [yearStart]
      );
    }

    const mutationRows = await mutationRowsQ;

    // E) Map sums
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

    // F) Merge + compute closing
    const items = [];

    for (const a of accounts) {
      const normalPos = normalBalanceFromAccount(a);

      const openingSum = openingByAccountId.get(a.id) || {
        debit: 0,
        credit: 0,
      };
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
        signedFromSums(
          { debit: mutationDebit, credit: mutationCredit },
          normalPos
        )
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

    // G) totals
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

    // H) sort
    items.sort((a, b) => {
      const c = String(a.code || "").localeCompare(String(b.code || ""), "en", {
        numeric: true,
      });
      if (c !== 0) return c;
      return String(a.name || "").localeCompare(String(b.name || ""), "en");
    });

    return {
      period: { from_date: fromYmd, to_date: toYmd },
      opening_policy: useOpeningBaseline
        ? fromYmd === yearStart
          ? "opening = entry_type=opening on year_start (baseline year)"
          : "opening = sum from year_start .. < from_date (baseline year)"
        : "opening = (< from_date)",
      items,
      totals,
    };
  }
}

module.exports = TrialBalanceService;
