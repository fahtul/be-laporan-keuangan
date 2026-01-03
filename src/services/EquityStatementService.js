const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function oppositePos(pos) {
  return pos === "debit" ? "credit" : "debit";
}

function normalBalanceFromType(type) {
  const t = String(type || "").toLowerCase();
  return t === "asset" || t === "expense" ? "debit" : "credit";
}

function signedFromDebitCredit({ debit, credit }, normalPos) {
  const d = Number(debit || 0);
  const c = Number(credit || 0);
  return normalPos === "debit" ? round2(d - c) : round2(c - d);
}

function sideFromSigned(signed, normalPos) {
  return signed >= 0 ? normalPos : oppositePos(normalPos);
}

function toAmountSide(signed, normalPos) {
  return {
    amount: round2(Math.abs(Number(signed || 0))),
    side: sideFromSigned(signed, normalPos),
  };
}

function classifyEquityAccount(account) {
  const code = String(account?.code || "").trim();
  const name = String(account?.name || "").toLowerCase();

  if (code.startsWith("31") || name.includes("modal")) return "capital";
  if (
    code.startsWith("33") ||
    name.includes("dividen") ||
    name.includes("prive")
  )
    return "dividend";
  if (
    code.startsWith("333") ||
    name.includes("koreksi") ||
    name.includes("penyesuaian")
  )
    return "adjustment";

  return "other";
}

class EquityStatementService {
  constructor({ incomeStatementService }) {
    this._incomeStatement = incomeStatementService;
  }

  _baseSumQuery({ organizationId, accountIds }) {
    return knex("journal_lines as jl")
      .join("journal_entries as je", "je.id", "jl.entry_id")
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .whereIn("jl.account_id", accountIds)
      .andWhere("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted");
  }

  async _sumOpeningByAccount({ organizationId, accountIds, fromDate }) {
    if (!accountIds || accountIds.length === 0) return new Map();

    // OPENING = semua sebelum fromDate (by DATE) + entry_type='opening' tepat di fromDate (by DATE)
    const rows = await this._baseSumQuery({ organizationId, accountIds })
      .andWhereRaw(
        `(je.date::date < ?::date OR (je.date::date = ?::date AND je.entry_type = 'opening'))`,
        [fromDate, fromDate]
      )
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

  async _sumMutationByAccount({
    organizationId,
    accountIds,
    fromDate,
    toDate,
  }) {
    if (!accountIds || accountIds.length === 0) return new Map();

    // MUTATION = range periode (by DATE) tapi EXCLUDE entry_type='opening'
    const rows = await this._baseSumQuery({ organizationId, accountIds })
      .andWhereRaw(`je.date::date >= ?::date`, [fromDate])
      .andWhereRaw(`je.date::date <= ?::date`, [toDate])
      .andWhereRaw(`je.entry_type IS DISTINCT FROM 'opening'`)
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

  async getReport({
    organizationId,
    fromDate,
    toDate,
    includeZero = false,
    includeHeader = false,
    useCodeRule = false,
    includeVirtualProfit = true,
    profitMode = "net",
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    // 1) Load equity accounts
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
      .andWhere((qb) => {
        if (useCodeRule) qb.where("a.code", "like", "3%");
        else qb.where("a.type", "equity");
      })
      .orderBy("a.code", "asc")
      .orderBy("a.name", "asc");

    if (!includeHeader) accountsQ.andWhere("a.is_postable", true);

    const accounts = await accountsQ;
    const equityIds = accounts.map((a) => a.id);

    // 2) Opening & Mutation (FIXED)
    const openingMap = await this._sumOpeningByAccount({
      organizationId,
      accountIds: equityIds,
      fromDate,
    });

    const mutationMap = await this._sumMutationByAccount({
      organizationId,
      accountIds: equityIds,
      fromDate,
      toDate,
    });

    // 3) Profit for period
    let profitSigned = 0;
    if (includeVirtualProfit) {
      if (!this._incomeStatement?.getIncomeStatement) {
        throw new InvariantError("incomeStatementService is not available");
      }

      const income = await this._incomeStatement.getIncomeStatement({
        organizationId,
        fromDate,
        toDate,
        includeZero: false,
        includeHeader: false,
        taxRate: null,
        grouping: "excel",
      });

      const summary = income?.summary || {};
      if (String(profitMode || "net").toLowerCase() === "after_tax") {
        profitSigned = round2(Number(summary.net_profit_after_tax || 0));
      } else {
        profitSigned = round2(
          Number(summary.net_profit ?? summary.net_profit_after_tax ?? 0)
        );
      }
    }

    // 4) Build opening/closing + movements categories
    const openingItems = [];
    const closingItems = [];

    let openingTotalSigned = 0;
    let closingTotalSigned = 0;

    const categories = {
      capital: {
        key: "capital",
        label: "Modal/Setoran Modal",
        items: [],
        totalSigned: 0,
      },
      dividend: {
        key: "dividend",
        label: "Dividen/Prive",
        items: [],
        totalSigned: 0,
      },
      adjustment: {
        key: "adjustment",
        label: "Penyesuaian/Koreksi",
        items: [],
        totalSigned: 0,
      },
      other: {
        key: "other",
        label: "Perubahan Lainnya",
        items: [],
        totalSigned: 0,
      },
    };

    for (const a of accounts) {
      const nb = String(a.normal_balance || "").toLowerCase();
      const normalPos =
        nb === "debit" || nb === "credit" ? nb : normalBalanceFromType(a.type);

      // OPENING
      const openingDC = openingMap.get(a.id) || { debit: 0, credit: 0 };
      const openingSigned = signedFromDebitCredit(openingDC, normalPos);
      openingTotalSigned = round2(openingTotalSigned + openingSigned);

      const openingDisplay = toAmountSide(openingSigned, normalPos);
      if (includeZero || openingDisplay.amount !== 0) {
        openingItems.push({
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          normal_balance: normalPos,
          amount: openingDisplay.amount,
          side: openingDisplay.side,
        });
      }

      // MUTATION (period change, EXCLUDES opening entry_type)
      const mutationDC = mutationMap.get(a.id) || { debit: 0, credit: 0 };
      const mutationSigned = signedFromDebitCredit(mutationDC, normalPos);

      if (mutationSigned !== 0 || includeZero) {
        const key = classifyEquityAccount(a);
        const bucket = categories[key] || categories.other;
        bucket.totalSigned = round2(bucket.totalSigned + mutationSigned);
        bucket.items.push({
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          normal_balance: normalPos,
          ...toAmountSide(mutationSigned, normalPos),
        });
      }

      // CLOSING (opening + mutation)
      const closingSigned = round2(openingSigned + mutationSigned);
      closingTotalSigned = round2(closingTotalSigned + closingSigned);

      const closingDisplay = toAmountSide(closingSigned, normalPos);
      if (includeZero || closingDisplay.amount !== 0) {
        closingItems.push({
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          normal_balance: normalPos,
          amount: closingDisplay.amount,
          side: closingDisplay.side,
        });
      }
    }

    // 5) Profit movement category
    const movementCategories = [];
    const pushCategory = (cat) => {
      const items = includeZero
        ? cat.items
        : cat.items.filter((it) => it.amount !== 0);
      if (!includeZero && items.length === 0) return;

      const total = toAmountSide(cat.totalSigned, "credit");
      // sort items biar rapih
      items.sort((a, b) =>
        String(a.code || "").localeCompare(String(b.code || ""), "en", {
          numeric: true,
        })
      );

      movementCategories.push({
        key: cat.key,
        label: cat.label,
        items,
        total,
      });
    };

    pushCategory(categories.capital);
    pushCategory(categories.dividend);
    pushCategory(categories.adjustment);
    pushCategory(categories.other);

    if (includeVirtualProfit) {
      movementCategories.push({
        key: "profit",
        label: "Laba periode berjalan",
        items: [
          {
            kind: "profit",
            amount: round2(Math.abs(profitSigned)),
            side: profitSigned >= 0 ? "credit" : "debit",
          },
        ],
        total: toAmountSide(profitSigned, "credit"),
      });
    }

    const movementsSigned = round2(
      categories.capital.totalSigned +
        categories.dividend.totalSigned +
        categories.adjustment.totalSigned +
        categories.other.totalSigned +
        (includeVirtualProfit ? profitSigned : 0)
    );

    const movementsTotal = toAmountSide(movementsSigned, "credit");
    const openingTotal = toAmountSide(openingTotalSigned, "credit");

    // Closing reported includes profit effect if enabled (assuming profit not posted to equity)
    const closingReportedSigned = round2(
      closingTotalSigned + (includeVirtualProfit ? profitSigned : 0)
    );
    const closingTotal = toAmountSide(closingReportedSigned, "credit");

    return {
      period: {
        from_date: String(fromDate).trim(),
        to_date: String(toDate).trim(),
      },
      meta: {
        include_zero: !!includeZero,
        include_header: !!includeHeader,
        use_code_rule: !!useCodeRule,
        include_virtual_profit: !!includeVirtualProfit,
        profit_mode: String(profitMode || "net").toLowerCase(),
      },
      opening: {
        items: openingItems,
        total: openingTotal,
      },
      movements: {
        categories: movementCategories,
        net_change: movementsTotal,
      },
      closing: {
        items: closingItems,
        total: closingTotal,
      },
      totals: {
        opening_amount: openingTotal.amount,
        movements_amount: movementsTotal.amount,
        closing_amount: closingTotal.amount,
        net_profit: profitSigned,
      },
    };
  }
}

module.exports = EquityStatementService;
