const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");

const DB_CLIENT = knex?.client?.config?.client;
const IS_PG = DB_CLIENT === "pg";
const IS_MYSQL = DB_CLIENT === "mysql" || DB_CLIENT === "mysql2";

function andWhereDateOnlyRange(qb, qualifiedColumn, fromDate, toDate) {
  const fd = String(fromDate || "").trim();
  const td = String(toDate || "").trim();

  if (IS_PG) {
    qb.andWhereRaw(`${qualifiedColumn}::date >= ?::date`, [fd]);
    qb.andWhereRaw(`${qualifiedColumn}::date <= ?::date`, [td]);
    return;
  }

  if (IS_MYSQL) {
    qb.andWhereRaw(`DATE(${qualifiedColumn}) >= ?`, [fd]);
    qb.andWhereRaw(`DATE(${qualifiedColumn}) <= ?`, [td]);
    return;
  }

  qb.andWhere(qualifiedColumn, ">=", fd);
  qb.andWhere(qualifiedColumn, "<=", td);
}

/**
 * Standard COA mapping (Excel-style):
 * - 4xx.. = Revenue (Pendapatan)
 * - 51xx.. = COGS / HPP
 * - 52xx..59xx.. = Operating Expenses (Beban)
 * - Default exclusions (often appears as closing/ikhtisar in Excel COA):
 *   - 533 (Ikhtisar Laba Rugi)
 */
const EXCLUDED_CODES = ["533"];

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function normalizeCode(code) {
  return String(code ?? "").trim();
}

function shouldExclude(code) {
  const c = normalizeCode(code);
  return EXCLUDED_CODES.includes(c);
}

function isRevenueCode(code) {
  const c = normalizeCode(code);
  return c.startsWith("4");
}

function isExpenseCode(code) {
  const c = normalizeCode(code);
  return c.startsWith("5");
}

function isCogsCode(code) {
  const c = normalizeCode(code);
  return c.startsWith("51");
}

function inferSection({ code, type }) {
  const t = String(type || "").toLowerCase();
  const c = normalizeCode(code);

  // Prefer code-prefix when available, fallback to type.
  const revenueLike = c ? isRevenueCode(c) : t === "revenue";
  const expenseLike = c ? isExpenseCode(c) : t === "expense";

  if (revenueLike) return "revenue";
  if (expenseLike) return isCogsCode(c) ? "cogs" : "opex";
  return "other";
}

function toAmount({ code, type, sumDebit, sumCredit }) {
  const debit = Number(sumDebit || 0);
  const credit = Number(sumCredit || 0);

  const t = String(type || "").toLowerCase();

  // Use type OR code-prefix to decide sign.
  if (t === "revenue" || isRevenueCode(code)) return round2(credit - debit);
  if (t === "expense" || isExpenseCode(code)) return round2(debit - credit);

  return 0;
}

class IncomeStatementService {
  async getIncomeStatement({
    organizationId,
    fromDate,
    toDate,
    includeZero = false,
    includeHeader = false,
    taxRate = null,
    grouping = "excel",
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    if (taxRate !== null && (Number.isNaN(Number(taxRate)) || taxRate < 0 || taxRate > 1)) {
      throw new InvariantError("tax_rate must be between 0 and 1");
    }

    const groupingNorm = String(grouping || "excel").toLowerCase();
    if (!["excel", "simple"].includes(groupingNorm)) {
      throw new InvariantError('grouping must be "excel" or "simple"');
    }

    // Aggregation (posted only, in-range). Use subquery + join so include_zero can decide join type.
    const agg = knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .modify((qb) => andWhereDateOnlyRange(qb, "je.date", fromDate, toDate))
      .groupBy("jl.account_id")
      .select("jl.account_id")
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      )
      .as("agg");

    const base = knex("accounts as a")
      .select("a.id as account_id", "a.code", "a.name", "a.type")
      .select(
        knex.raw("COALESCE(agg.sum_debit, 0) as sum_debit"),
        knex.raw("COALESCE(agg.sum_credit, 0) as sum_credit")
      )
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at")
      .andWhere((qb) => {
        qb.whereIn("a.type", ["revenue", "expense"])
          .orWhere("a.code", "like", "4%")
          .orWhere("a.code", "like", "5%");
      })
      .whereNotIn("a.code", EXCLUDED_CODES)
      .orderBy("a.code", "asc")
      .orderBy("a.name", "asc");

    if (!includeHeader) base.andWhere("a.is_postable", true);

    // Two modes:
    // - include_zero=0 : inner join -> only accounts with activity.
    // - include_zero=1 : left join -> show accounts with 0 activity too.
    if (includeZero) base.leftJoin(agg, "agg.account_id", "a.id");
    else base.join(agg, "agg.account_id", "a.id");

    const rows = await base;

    // 3) Build sections (Excel-style: Revenue, COGS/HPP, OPEX/Beban)
    const sectionsByKey = {
      revenue: { key: "revenue", title: "PENDAPATAN", items: [], total: 0 },
      cogs: { key: "cogs", title: "HPP", items: [], total: 0 },
      opex: { key: "opex", title: "BEBAN", items: [], total: 0 },
    };

    for (const r of rows) {
      const code = normalizeCode(r.code);
      const type = String(r.type || "").toLowerCase();

      if (shouldExclude(code)) continue;

      const sumDebit = round2(r.sum_debit);
      const sumCredit = round2(r.sum_credit);

      if (!includeZero && sumDebit + sumCredit === 0) continue;

      const section = inferSection({ code, type });
      if (section === "other") continue;

      const amount = toAmount({ code, type, sumDebit, sumCredit });

      const item = {
        account_id: r.account_id,
        code,
        name: r.name,
        amount,
      };

      // For grouping=simple: put all expense into opex and keep cogs empty.
      const sectionKey =
        groupingNorm === "simple" && section === "cogs" ? "opex" : section;

      const sec = sectionsByKey[sectionKey];
      sec.items.push(item);
      sec.total = round2(sec.total + amount);
    }

    // Stable sort items (numeric code)
    const byCodeName = (a, b) => {
      const c = String(a.code || "").localeCompare(String(b.code || ""), "en", {
        numeric: true,
      });
      if (c !== 0) return c;
      return String(a.name || "").localeCompare(String(b.name || ""), "en");
    };
    sectionsByKey.revenue.items.sort(byCodeName);
    sectionsByKey.cogs.items.sort(byCodeName);
    sectionsByKey.opex.items.sort(byCodeName);

    // 4) Summary totals
    const totalRevenue = round2(sectionsByKey.revenue.total);
    const totalCogs = round2(sectionsByKey.cogs.total);
    const totalOpex = round2(sectionsByKey.opex.total);

    const grossProfit = round2(totalRevenue - totalCogs);
    const operatingProfit = round2(grossProfit - totalOpex);

    const taxRateNum = taxRate === null ? null : Number(taxRate);
    const taxAmount =
      taxRateNum !== null && operatingProfit > 0
        ? round2(operatingProfit * taxRateNum)
        : 0;

    const netAfterTax = round2(operatingProfit - taxAmount);

    return {
      period: { from_date: fromDate, to_date: toDate },
      sections:
        groupingNorm === "simple"
          ? [sectionsByKey.revenue, sectionsByKey.opex]
          : [sectionsByKey.revenue, sectionsByKey.cogs, sectionsByKey.opex],
      summary: {
        total_revenue: totalRevenue,
        total_cogs: groupingNorm === "simple" ? 0 : totalCogs,
        gross_profit: groupingNorm === "simple" ? totalRevenue : grossProfit,
        total_operating_expense: totalOpex,
        operating_profit:
          groupingNorm === "simple" ? round2(totalRevenue - totalOpex) : operatingProfit,
        tax_rate: taxRateNum,
        tax_amount: taxAmount,
        net_profit_after_tax: netAfterTax,
        net_profit_pos: netAfterTax >= 0 ? "profit" : "loss",
      },
    };
  }
}

module.exports = IncomeStatementService;
