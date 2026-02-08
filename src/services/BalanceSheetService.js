const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");
const IncomeStatementService = require("./IncomeStatementService");

const DB_CLIENT = knex?.client?.config?.client;
const IS_PG = DB_CLIENT === "pg";
const IS_MYSQL = DB_CLIENT === "mysql" || DB_CLIENT === "mysql2";

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

function signedBalance({ sumDebit, sumCredit }, normalPos) {
  const debit = Number(sumDebit || 0);
  const credit = Number(sumCredit || 0);
  return normalPos === "debit"
    ? round2(debit - credit)
    : round2(credit - debit);
}

function toDisplay(signed, normalPos) {
  const pos = posFromSigned(signed, normalPos);
  const amount = round2(Math.abs(Number(signed || 0)));
  return { amount, pos };
}

function normalizeProfitBasis(basis) {
  const b = String(basis || "after_tax")
    .trim()
    .toLowerCase();
  if (b === "after_tax" || b === "operating" || b === "net") return b;
  return "after_tax";
}

class BalanceSheetService {
  constructor() {
    this._incomeStatement = new IncomeStatementService();
  }

  async getBalanceSheet({
    organizationId,
    asOf,
    year,
    includeZero = false,
    includeHeader = false,
    profitBasis = "after_tax",
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");

    const asOfStr = String(asOf || "").trim();
    if (!asOfStr) throw new InvariantError("as_of is required");

    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 1000 || yearNum > 9999) {
      throw new InvariantError("year must be a 4-digit number");
    }

    const asOfYear = Number(asOfStr.slice(0, 4));
    if (!Number.isInteger(asOfYear)) throw new InvariantError("Invalid as_of");
    if (yearNum > asOfYear) {
      throw new InvariantError("year must be <= year(as_of)");
    }

    const basis = normalizeProfitBasis(profitBasis);
    const profitFromDate = `${yearNum}-01-01`;
    const profitToDate = asOfStr;

    // Accounts + aggregation up to as_of (posted only)
    const base = knex("accounts as a")
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at")
      .andWhere((qb) => {
        qb.where("a.code", "like", "1%")
          .orWhere("a.code", "like", "2%")
          .orWhere("a.code", "like", "3%");
      });

    if (!includeHeader) base.andWhere("a.is_postable", true);

    // Keep entry filters inside JOIN (not WHERE), so include_zero can still show accounts.
    base.leftJoin("journal_lines as jl", function joinLines() {
      this.on("jl.account_id", "=", "a.id")
        .andOn("jl.organization_id", "=", knex.raw("?", [organizationId]))
        .andOn(knex.raw("jl.deleted_at IS NULL"));
    });

    base.leftJoin("journal_entries as je", function joinEntries() {
      this.on("je.id", "=", "jl.entry_id")
        .andOn("je.organization_id", "=", knex.raw("?", [organizationId]))
        .andOn(knex.raw("je.deleted_at IS NULL"))
        .andOn("je.status", "=", knex.raw("?", ["posted"]))
        .andOn(
          IS_PG
            ? knex.raw("je.date::date <= ?::date", [asOfStr])
            : IS_MYSQL
              ? knex.raw("DATE(je.date) <= ?", [asOfStr])
              : knex.raw("je.date <= ?", [asOfStr])
        );
    });

    const rows = await base
      .groupBy("a.id", "a.code", "a.name", "a.type")
      .select("a.id as account_id", "a.code", "a.name", "a.type")
      .select(
        knex.raw(
          "COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 ELSE jl.debit END), 0) as sum_debit"
        ),
        knex.raw(
          "COALESCE(SUM(CASE WHEN je.id IS NULL THEN 0 ELSE jl.credit END), 0) as sum_credit"
        )
      )
      .orderBy("a.code", "asc");

    const sections = {
      assets: { items: [], total: 0 },
      liabilities: { items: [], total: 0 },
      equity: { items: [], total: 0 },
      current_profit: { basis, amount: 0, pos: "credit" },
    };

    let assetsSigned = 0;
    let liabilitiesSigned = 0;
    let equitySigned = 0;

    for (const r of rows) {
      const code = String(r.code || "").trim();

      const isAsset = code.startsWith("1");
      const isLiability = code.startsWith("2");
      const isEquity = code.startsWith("3");
      if (!isAsset && !isLiability && !isEquity) continue;

      const normalPos = isAsset ? "debit" : "credit";
      const signed = signedBalance(
        { sumDebit: r.sum_debit, sumCredit: r.sum_credit },
        normalPos
      );
      const display = toDisplay(signed, normalPos);

      if (!includeZero && display.amount === 0) continue;

      const item = {
        account_id: r.account_id,
        code,
        name: r.name,
        amount: display.amount,
        pos: display.pos,
      };

      if (isAsset) {
        sections.assets.items.push(item);
        assetsSigned = round2(assetsSigned + signed);
      } else if (isLiability) {
        sections.liabilities.items.push(item);
        liabilitiesSigned = round2(liabilitiesSigned + signed);
      } else {
        sections.equity.items.push(item);
        equitySigned = round2(equitySigned + signed);
      }
    }

    // Profit (YTD) via internal IncomeStatementService (no HTTP)
    const income = await this._incomeStatement.getIncomeStatement({
      organizationId,
      fromDate: profitFromDate,
      toDate: profitToDate,
      includeZero: false,
      includeHeader: false,
      taxRate: null,
      grouping: "excel",
    });

    const summary = income?.summary || {};
    let profitValue = 0;
    if (basis === "operating")
      profitValue = Number(summary.operating_profit || 0);
    else if (basis === "net")
      profitValue = Number(
        summary.net_profit ?? summary.net_profit_after_tax ?? 0
      );
    else profitValue = Number(summary.net_profit_after_tax || 0);

    const profitSignedAsEquity = round2(profitValue);
    const profitDisplay = toDisplay(profitSignedAsEquity, "credit");

    sections.current_profit = {
      basis,
      amount: profitDisplay.amount,
      pos: profitDisplay.pos,
    };

    sections.assets.total = round2(assetsSigned);
    sections.liabilities.total = round2(liabilitiesSigned);
    sections.equity.total = round2(equitySigned);

    const rhsSigned = round2(
      liabilitiesSigned + equitySigned + profitSignedAsEquity
    );
    const difference = round2(assetsSigned - rhsSigned);
    const balanced = Math.abs(difference) < 0.01;

    return {
      as_of: asOfStr,
      profit_period: { from_date: profitFromDate, to_date: profitToDate },
      sections,
      totals: {
        assets_total: round2(assetsSigned),
        liabilities_total: round2(liabilitiesSigned),
        equity_total: round2(equitySigned),
        liabilities_plus_equity: rhsSigned,
        difference,
      },
      balanced,
    };
  }
}

module.exports = BalanceSheetService;
