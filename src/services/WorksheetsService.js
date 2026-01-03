const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function oppositePos(pos) {
  return pos === "debit" ? "credit" : "debit";
}

function posFromSigned(signed, normalPos) {
  return signed >= 0 ? normalPos : oppositePos(normalPos);
}

function normalBalanceFromAccount(account) {
  const nb = String(account?.normal_balance || "").toLowerCase();
  if (nb === "debit" || nb === "credit") return nb;

  const type = String(account?.type || "").toLowerCase();
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

function signedFromSums({ debit, credit }, normalPos) {
  const d = Number(debit || 0);
  const c = Number(credit || 0);
  return normalPos === "debit" ? d - c : c - d;
}

function netFromSigned(signed, normalPos) {
  const pos = posFromSigned(signed, normalPos);
  const abs = round2(Math.abs(signed));
  return { debit: pos === "debit" ? abs : 0, credit: pos === "credit" ? abs : 0 };
}

function addDaysYmd(ymd, deltaDays) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isPnlAccount({ type, code }, useCodeRule) {
  const t = String(type || "").toLowerCase();
  if (t === "revenue" || t === "expense") return true;
  if (!useCodeRule) return false;
  const c = String(code || "").trim();
  return c.startsWith("4") || c.startsWith("5");
}

function isBalanceSheetAccount({ type }) {
  const t = String(type || "").toLowerCase();
  return t === "asset" || t === "liability" || t === "equity";
}

class WorksheetsService {
  async _sumByAccount({ organizationId, accountIds, dateFrom, dateTo }) {
    if (!accountIds || accountIds.length === 0) return new Map();

    const q = knex("journal_lines as jl")
      .join("journal_entries as je", "je.id", "jl.entry_id")
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .whereIn("jl.account_id", accountIds)
      .andWhere("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted");

    if (dateFrom !== null && dateFrom !== undefined) q.andWhere("je.date", ">=", dateFrom);
    if (dateTo !== null && dateTo !== undefined) q.andWhere("je.date", "<=", dateTo);

    const rows = await q
      .groupBy("jl.account_id")
      .select("jl.account_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    const map = new Map();
    for (const r of rows) {
      map.set(r.account_id, {
        debit: round2(r.sum_debit),
        credit: round2(r.sum_credit),
      });
    }
    return map;
  }

  async getWorksheet({
    organizationId,
    fromDate,
    toDate,
    includeZero = false,
    includeHeader = false,
    useCodeRule = false,
    includeVirtualProfit = true,
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    const openingAsOf = addDaysYmd(fromDate, -1);
    if (!openingAsOf) throw new InvariantError("Invalid from_date");

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
      .whereNull("a.deleted_at")
      .orderBy("a.code", "asc")
      .orderBy("a.name", "asc");

    if (!includeHeader) accountsQ.andWhere("a.is_postable", true);

    const accounts = await accountsQ;
    const accountIds = accounts.map((a) => a.id);

    // B) Opening sums (< fromDate)
    const openingMap = await this._sumByAccount({
      organizationId,
      accountIds,
      dateFrom: null,
      dateTo: addDaysYmd(fromDate, -1),
    });

    // C) Mutation sums (between)
    const mutationMap = await this._sumByAccount({
      organizationId,
      accountIds,
      dateFrom: fromDate,
      dateTo: toDate,
    });

    const items = [];

    // Totals
    const totals = {
      opening_debit: 0,
      opening_credit: 0,
      mutation_debit: 0,
      mutation_credit: 0,
      closing_debit: 0,
      closing_credit: 0,
      pnl_debit: 0,
      pnl_credit: 0,
      final_debit: 0,
      final_credit: 0,
      net_profit: 0,
    };

    let revenueTotal = 0;
    let expenseTotal = 0;

    for (const a of accounts) {
      const opening = openingMap.get(a.id) || { debit: 0, credit: 0 };
      const mutation = mutationMap.get(a.id) || { debit: 0, credit: 0 };

      // Closing must be NET balance (saldo bersih) shown on one side only.
      // Opening/mutation remain gross sums, but closing uses signed logic based on normal balance.
      const normalPos = normalBalanceFromAccount(a);
      const openingSigned = round2(signedFromSums(opening, normalPos));
      const mutationSigned = round2(signedFromSums(mutation, normalPos));
      const closingSigned = round2(openingSigned + mutationSigned);
      const closing = netFromSigned(closingSigned, normalPos);

      const pnlAcc = isPnlAccount(a, useCodeRule);
      const bsAcc = isBalanceSheetAccount(a);

      const pnl = pnlAcc ? closing : { debit: 0, credit: 0 };
      const final = bsAcc ? closing : { debit: 0, credit: 0 };

      const allZero =
        opening.debit === 0 &&
        opening.credit === 0 &&
        mutation.debit === 0 &&
        mutation.credit === 0 &&
        closing.debit === 0 &&
        closing.credit === 0;

      if (!includeZero && allZero) continue;

      const row = {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        normal_balance: a.normal_balance,
        opening,
        mutation,
        closing,
        pnl,
        final,
      };

      items.push(row);

      totals.opening_debit += opening.debit;
      totals.opening_credit += opening.credit;
      totals.mutation_debit += mutation.debit;
      totals.mutation_credit += mutation.credit;
      totals.closing_debit += closing.debit;
      totals.closing_credit += closing.credit;
      totals.pnl_debit += pnl.debit;
      totals.pnl_credit += pnl.credit;
      totals.final_debit += final.debit;
      totals.final_credit += final.credit;

      if (pnlAcc) {
        const t = String(a.type || "").toLowerCase();
        const code = String(a.code || "").trim();
        const isRevenue = t === "revenue" || (useCodeRule && code.startsWith("4"));
        const isExpense = t === "expense" || (useCodeRule && code.startsWith("5"));

        if (isRevenue) revenueTotal += round2(closing.credit - closing.debit);
        else if (isExpense) expenseTotal += round2(closing.debit - closing.credit);
      }
    }

    revenueTotal = round2(revenueTotal);
    expenseTotal = round2(expenseTotal);

    const netProfit = round2(revenueTotal - expenseTotal);
    totals.net_profit = netProfit;

    const virtualRows = [];
    if (includeVirtualProfit) {
      const final = netProfit >= 0
        ? { debit: 0, credit: round2(netProfit) }
        : { debit: round2(Math.abs(netProfit)), credit: 0 };

      virtualRows.push({
        kind: "current_profit",
        code: "",
        name: "Laba Berjalan",
        type: "equity",
        final,
      });

      totals.final_debit += final.debit;
      totals.final_credit += final.credit;
    }

    // finalize rounding totals
    Object.keys(totals).forEach((k) => {
      totals[k] = round2(totals[k]);
    });

    return {
      period: {
        from_date: String(fromDate).trim(),
        to_date: String(toDate).trim(),
        opening_as_of: openingAsOf,
        ending_as_of: String(toDate).trim(),
      },
      meta: {
        include_zero: !!includeZero,
        include_header: !!includeHeader,
        use_code_rule: !!useCodeRule,
        include_virtual_profit: !!includeVirtualProfit,
      },
      items,
      totals,
      virtual_rows: virtualRows,
    };
  }
}

module.exports = WorksheetsService;

