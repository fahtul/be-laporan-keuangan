const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");
const NotFoundError = require("../exceptions/NotFoundError");

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

function signedDelta(debit, credit, normalPos) {
  const d = Number(debit || 0);
  const c = Number(credit || 0);
  return normalPos === "debit" ? d - c : c - d;
}

function toAmountSide(signed, normalPos) {
  const side = posFromSigned(signed, normalPos);
  const amount = round2(Math.abs(Number(signed || 0)));
  return { amount, side, signed: round2(signed) };
}

class SubledgersService {
  async _loadAccount({ organizationId, accountId }) {
    const row = await knex("accounts as a")
      .select(
        "a.id",
        "a.code",
        "a.name",
        "a.type",
        "a.normal_balance",
        "a.requires_bp",
        "a.subledger",
        "a.is_postable"
      )
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at")
      .andWhere("a.id", accountId)
      .first();

    if (!row) throw new NotFoundError("Account not found");

    if (row.requires_bp !== true) {
      throw new InvariantError(
        "Selected account is not configured for business partner subledger (requires_bp=true)"
      );
    }

    const normalPos = normalBalanceFromAccount(row);

    return {
      account: {
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        normal_balance: normalPos,
        subledger: row.subledger ?? null,
        requires_bp: row.requires_bp === true,
      },
      normalPos,
    };
  }

  async _loadBp({ organizationId, bpId }) {
    const bp = await knex("business_partners as bp")
      .select("bp.id", "bp.code", "bp.name", "bp.category")
      .where("bp.organization_id", organizationId)
      .whereNull("bp.deleted_at")
      .andWhere("bp.id", bpId)
      .first();

    if (!bp) throw new NotFoundError("Business partner not found");

    return {
      id: bp.id,
      code: bp.code,
      name: bp.name,
      type: bp.category ?? null,
    };
  }

  async _aggByBp({ organizationId, accountId, fromDate, toDate, mode }) {
    const q = knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .whereNotNull("jl.bp_id")
      .groupBy("jl.bp_id")
      .select("jl.bp_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    if (mode === "opening") {
      q.andWhere("je.date", "<", fromDate);
    } else if (mode === "mutation") {
      q.andWhere("je.date", ">=", fromDate).andWhere("je.date", "<=", toDate);
    } else {
      throw new InvariantError("Invalid agg mode");
    }

    return q;
  }

  async listByBpSummary({
    organizationId,
    fromDate,
    toDate,
    accountId,
    q = "",
    includeZero = false,
    page = 1,
    limit = 50,
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    const { account, normalPos } = await this._loadAccount({
      organizationId,
      accountId,
    });

    const openingRows = await this._aggByBp({
      organizationId,
      accountId,
      fromDate,
      toDate,
      mode: "opening",
    });

    const mutationRows = await this._aggByBp({
      organizationId,
      accountId,
      fromDate,
      toDate,
      mode: "mutation",
    });

    const openingMap = new Map();
    for (const r of openingRows) {
      openingMap.set(String(r.bp_id), {
        debit: round2(r.sum_debit),
        credit: round2(r.sum_credit),
      });
    }

    const mutationMap = new Map();
    for (const r of mutationRows) {
      mutationMap.set(String(r.bp_id), {
        debit: round2(r.sum_debit),
        credit: round2(r.sum_credit),
      });
    }

    const candidateBpIds = new Set();
    for (const id of openingMap.keys()) candidateBpIds.add(id);
    for (const id of mutationMap.keys()) candidateBpIds.add(id);

    const bpQuery = knex("business_partners as bp")
      .select("bp.id", "bp.code", "bp.name", "bp.category")
      .where("bp.organization_id", organizationId)
      .whereNull("bp.deleted_at");

    const qq = String(q || "").trim();
    if (qq) {
      const like = `%${qq}%`;
      bpQuery.andWhere((qb) => {
        qb.whereILike("bp.code", like).orWhereILike("bp.name", like);
      });
    }

    if (!includeZero) {
      const ids = Array.from(candidateBpIds);
      if (ids.length === 0) {
        return {
          period: { from_date: fromDate, to_date: toDate },
          account,
          items: [],
          totals: {
            opening_amount: 0,
            opening_side: normalPos,
            mutation_debit: 0,
            mutation_credit: 0,
            closing_amount: 0,
            closing_side: normalPos,
          },
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 1,
            q: qq,
            include_zero: includeZero,
          },
        };
      }
      bpQuery.whereIn("bp.id", ids);
    }

    const bps = await bpQuery
      .orderBy("bp.name", "asc")
      .orderBy("bp.code", "asc");

    const itemsAll = [];
    let totalOpeningSigned = 0;
    let totalClosingSigned = 0;
    let totalMutationDebit = 0;
    let totalMutationCredit = 0;

    for (const bp of bps) {
      const bpId = String(bp.id);

      const openingSum = openingMap.get(bpId) || { debit: 0, credit: 0 };
      const mutationSum = mutationMap.get(bpId) || { debit: 0, credit: 0 };

      const openingSigned = round2(
        signedDelta(openingSum.debit, openingSum.credit, normalPos)
      );

      const mutationDebit = round2(mutationSum.debit);
      const mutationCredit = round2(mutationSum.credit);
      const mutationSigned = round2(
        signedDelta(mutationDebit, mutationCredit, normalPos)
      );

      const closingSigned = round2(openingSigned + mutationSigned);

      const opening = toAmountSide(openingSigned, normalPos);
      const closing = toAmountSide(closingSigned, normalPos);

      if (
        !includeZero &&
        opening.amount === 0 &&
        mutationDebit === 0 &&
        mutationCredit === 0 &&
        closing.amount === 0
      ) {
        continue;
      }

      itemsAll.push({
        bp: {
          id: bp.id,
          code: bp.code,
          name: bp.name,
          type: bp.category ?? null,
        },
        opening,
        mutation: {
          debit: mutationDebit,
          credit: mutationCredit,
          signed: mutationSigned,
        },
        closing,
      });

      totalOpeningSigned = round2(totalOpeningSigned + openingSigned);
      totalClosingSigned = round2(totalClosingSigned + closingSigned);
      totalMutationDebit = round2(totalMutationDebit + mutationDebit);
      totalMutationCredit = round2(totalMutationCredit + mutationCredit);
    }

    const total = itemsAll.length;
    const cappedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const pageNum = Math.max(Number(page) || 1, 1);
    const totalPages = Math.max(1, Math.ceil(total / cappedLimit));
    const start = (pageNum - 1) * cappedLimit;
    const items = itemsAll.slice(start, start + cappedLimit);

    const openingTotal = toAmountSide(totalOpeningSigned, normalPos);
    const closingTotal = toAmountSide(totalClosingSigned, normalPos);

    return {
      period: { from_date: fromDate, to_date: toDate },
      account,
      items,
      totals: {
        opening_amount: openingTotal.amount,
        opening_side: openingTotal.side,
        mutation_debit: totalMutationDebit,
        mutation_credit: totalMutationCredit,
        closing_amount: closingTotal.amount,
        closing_side: closingTotal.side,
      },
      meta: {
        page: pageNum,
        limit: cappedLimit,
        total,
        totalPages,
        q: qq,
        include_zero: includeZero,
      },
    };
  }

  async getBpDetail({ organizationId, bpId, fromDate, toDate, accountId }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!bpId) throw new InvariantError("bpId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    const { account, normalPos } = await this._loadAccount({
      organizationId,
      accountId,
    });

    const bp = await this._loadBp({ organizationId, bpId });

    const openingSum = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .andWhere("jl.bp_id", bpId)
      .andWhere("je.date", "<", fromDate)
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      )
      .first();

    const openingDebit = round2(openingSum?.sum_debit);
    const openingCredit = round2(openingSum?.sum_credit);
    const openingSigned = round2(
      signedDelta(openingDebit, openingCredit, normalPos)
    );

    const txRows = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .andWhere("jl.bp_id", bpId)
      .andWhere("je.date", ">=", fromDate)
      .andWhere("je.date", "<=", toDate)
      .select(
        "je.id as entry_id",
        "je.date",
        "je.memo as entry_memo",
        "je.entry_type",
        "je.created_at as entry_created_at",
        "jl.id as line_id",
        "jl.memo as line_memo",
        "jl.debit",
        "jl.credit",
        "jl.created_at as line_created_at"
      )
      .orderBy("je.date", "asc")
      .orderBy("je.created_at", "asc")
      .orderBy("je.id", "asc")
      .orderBy("jl.created_at", "asc")
      .orderBy("jl.id", "asc");

    let runningSigned = openingSigned;

    const rows = [
      {
        kind: "opening",
        date: fromDate,
        ref: null,
        description: "Saldo awal",
        debit: 0,
        credit: 0,
        running_amount: round2(Math.abs(runningSigned)),
        running_side: posFromSigned(runningSigned, normalPos),
        running_signed: round2(runningSigned),
      },
    ];

    let periodDebit = 0;
    let periodCredit = 0;

    for (const r of txRows) {
      const debit = round2(r.debit);
      const credit = round2(r.credit);

      periodDebit = round2(periodDebit + debit);
      periodCredit = round2(periodCredit + credit);

      const delta = round2(signedDelta(debit, credit, normalPos));
      runningSigned = round2(runningSigned + delta);

      rows.push({
        kind: "tx",
        date: r.date,
        entry_id: r.entry_id,
        ref: r.entry_id,
        description: r.line_memo || r.entry_memo || "",
        debit,
        credit,
        running_amount: round2(Math.abs(runningSigned)),
        running_side: posFromSigned(runningSigned, normalPos),
        running_signed: round2(runningSigned),
      });
    }

    const closingSigned = runningSigned;

    return {
      period: { from_date: fromDate, to_date: toDate },
      account,
      bp,
      opening: toAmountSide(openingSigned, normalPos),
      totals: { period_debit: periodDebit, period_credit: periodCredit },
      closing: toAmountSide(closingSigned, normalPos),
      rows,
    };
  }
}

module.exports = SubledgersService;
