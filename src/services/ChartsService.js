const InvariantError = require("../exceptions/InvariantError");

function parseYmdToUtcDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatUtcDateToYmd(dt) {
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addUtcDays(dt, n) {
  const x = new Date(dt.getTime());
  x.setUTCDate(x.getUTCDate() + Number(n || 0));
  return x;
}

function endOfMonthUtc(dt) {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  // day 0 of next month => last day of current month
  return new Date(Date.UTC(y, m + 1, 0));
}

function endOfQuarterUtc(dt) {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth(); // 0..11
  const qEndMonth = Math.floor(m / 3) * 3 + 2; // 2,5,8,11
  return new Date(Date.UTC(y, qEndMonth + 1, 0));
}

function compareDates(a, b) {
  return a.getTime() - b.getTime();
}

function signedFromAmountSide(amount, side, normalPos = "credit") {
  const a = Number(amount || 0);
  const s = String(side || "").toLowerCase();
  const np = String(normalPos || "credit").toLowerCase();
  if (s !== "debit" && s !== "credit") return 0;
  // signed >=0 means normalPos side.
  const pos = s;
  const isNormal = pos === np;
  return isNormal ? a : -a;
}

class ChartsService {
  constructor({
    incomeStatementService,
    balanceSheetService,
    equityStatementService,
    cashFlowService,
  }) {
    this._income = incomeStatementService;
    this._balance = balanceSheetService;
    this._equity = equityStatementService;
    this._cash = cashFlowService;
  }

  _buckets({ fromDate, toDate, interval }) {
    const fd = parseYmdToUtcDate(fromDate);
    const td = parseYmdToUtcDate(toDate);
    if (!fd || !td) throw new InvariantError("Invalid from_date/to_date");
    if (compareDates(fd, td) > 0) throw new InvariantError("from_date must be <= to_date");

    const iv = String(interval || "month").toLowerCase();
    if (iv !== "month" && iv !== "quarter") {
      throw new InvariantError('interval must be "month" or "quarter"');
    }

    const out = [];
    let cursor = fd;
    while (compareDates(cursor, td) <= 0) {
      const end = iv === "quarter" ? endOfQuarterUtc(cursor) : endOfMonthUtc(cursor);
      const bucketEnd = compareDates(end, td) > 0 ? td : end;

      const from = formatUtcDateToYmd(cursor);
      const to = formatUtcDateToYmd(bucketEnd);
      const label =
        iv === "quarter"
          ? `${from.slice(0, 4)}-Q${Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1}`
          : from.slice(0, 7);

      out.push({ from_date: from, to_date: to, label, as_of: to });
      cursor = addUtcDays(bucketEnd, 1);
    }

    return out;
  }

  async getIncomeStatementSeries({
    organizationId,
    from_date,
    to_date,
    interval = "month",
    include_zero = false,
    include_header = false,
    tax_rate = null,
    grouping = "excel",
  }) {
    const buckets = this._buckets({ fromDate: from_date, toDate: to_date, interval });

    const labels = [];
    const revenue = [];
    const cogs = [];
    const opex = [];
    const grossProfit = [];
    const operatingProfit = [];
    const netAfterTax = [];

    for (const b of buckets) {
      labels.push(b.label);
      const report = await this._income.getIncomeStatement({
        organizationId,
        fromDate: b.from_date,
        toDate: b.to_date,
        includeZero: !!include_zero,
        includeHeader: !!include_header,
        taxRate: tax_rate === null ? null : Number(tax_rate),
        grouping,
      });

      const s = report?.summary || {};
      revenue.push(Number(s.total_revenue || 0));
      cogs.push(Number(s.total_cogs || 0));
      opex.push(Number(s.total_operating_expense || 0));
      grossProfit.push(Number(s.gross_profit || 0));
      operatingProfit.push(Number(s.operating_profit || 0));
      netAfterTax.push(Number(s.net_profit_after_tax || 0));
    }

    return {
      period: { from_date, to_date },
      interval,
      buckets,
      labels,
      series: {
        total_revenue: revenue,
        total_cogs: cogs,
        total_operating_expense: opex,
        gross_profit: grossProfit,
        operating_profit: operatingProfit,
        net_profit_after_tax: netAfterTax,
      },
    };
  }

  async getBalanceSheetSeries({
    organizationId,
    from_date,
    to_date,
    interval = "month",
    include_zero = false,
    include_header = false,
    profit_basis = "after_tax",
  }) {
    const buckets = this._buckets({ fromDate: from_date, toDate: to_date, interval });

    const labels = [];
    const assets = [];
    const liabilities = [];
    const equity = [];
    const currentProfitSigned = [];
    const balanced = [];

    for (const b of buckets) {
      labels.push(b.as_of);
      const year = Number(String(b.as_of).slice(0, 4));
      const report = await this._balance.getBalanceSheet({
        organizationId,
        asOf: b.as_of,
        year,
        includeZero: !!include_zero,
        includeHeader: !!include_header,
        profitBasis: profit_basis,
      });

      const totals = report?.totals || {};
      const sec = report?.sections || {};
      assets.push(Number(totals.assets_total ?? 0));
      liabilities.push(Number(totals.liabilities_total ?? 0));
      equity.push(Number(totals.equity_total ?? 0));

      const cp = sec.current_profit || {};
      const signed = signedFromAmountSide(cp.amount, cp.pos, "credit");
      currentProfitSigned.push(Number(signed || 0));
      balanced.push(!!report?.balanced);
    }

    return {
      period: { from_date, to_date },
      interval,
      buckets,
      labels,
      series: {
        assets_total: assets,
        liabilities_total: liabilities,
        equity_total: equity,
        current_profit_signed: currentProfitSigned,
        balanced,
      },
    };
  }

  async getEquityStatementSeries({
    organizationId,
    from_date,
    to_date,
    interval = "month",
    include_zero = false,
    include_header = false,
    use_code_rule = false,
    include_virtual_profit = true,
    profit_mode = "net",
  }) {
    const buckets = this._buckets({ fromDate: from_date, toDate: to_date, interval });

    const labels = [];
    const openingSigned = [];
    const movementSigned = [];
    const closingSigned = [];
    const netProfit = [];

    for (const b of buckets) {
      labels.push(b.label);
      const report = await this._equity.getReport({
        organizationId,
        fromDate: b.from_date,
        toDate: b.to_date,
        includeZero: !!include_zero,
        includeHeader: !!include_header,
        useCodeRule: !!use_code_rule,
        includeVirtualProfit: !!include_virtual_profit,
        profitMode: profit_mode,
      });

      const op = report?.opening?.total || {};
      const mv = report?.movements?.net_change || {};
      const cl = report?.closing?.total || {};

      openingSigned.push(signedFromAmountSide(op.amount, op.side, "credit"));
      movementSigned.push(signedFromAmountSide(mv.amount, mv.side, "credit"));
      closingSigned.push(signedFromAmountSide(cl.amount, cl.side, "credit"));
      netProfit.push(Number(report?.totals?.net_profit ?? 0));
    }

    return {
      period: { from_date, to_date },
      interval,
      buckets,
      labels,
      series: {
        opening_equity_signed: openingSigned,
        movements_signed: movementSigned,
        closing_equity_signed: closingSigned,
        net_profit: netProfit,
      },
    };
  }

  async getCashFlowSeries({
    organizationId,
    from_date,
    to_date,
    interval = "month",
    include_zero = false,
    include_details = false,
    cash_prefix = "11",
    cash_account_ids = null,
  }) {
    const buckets = this._buckets({ fromDate: from_date, toDate: to_date, interval });

    const labels = [];
    const begin = [];
    const end = [];
    const netChange = [];
    const cfo = [];
    const cfi = [];
    const cff = [];
    const reconciled = [];

    const rawCashIds = cash_account_ids;
    const cashAccountIds = Array.isArray(rawCashIds)
      ? rawCashIds
      : rawCashIds
        ? [rawCashIds]
        : null;

    for (const b of buckets) {
      labels.push(b.label);
      const report = await this._cash.getCashFlow({
        organizationId,
        fromDate: b.from_date,
        toDate: b.to_date,
        includeZero: !!include_zero,
        includeDetails: !!include_details,
        cashAccountIds,
        cashPrefix: cash_prefix,
      });

      begin.push(Number(report?.cash?.begin ?? 0));
      end.push(Number(report?.cash?.end ?? 0));
      netChange.push(Number(report?.totals?.net_change ?? report?.cash?.change ?? 0));
      cfo.push(Number(report?.totals?.net_cash_from_operating ?? 0));
      cfi.push(Number(report?.totals?.net_cash_from_investing ?? 0));
      cff.push(Number(report?.totals?.net_cash_from_financing ?? 0));
      reconciled.push(!!report?.reconciliation?.reconciled);
    }

    return {
      period: { from_date, to_date },
      interval,
      buckets,
      labels,
      series: {
        cash_begin: begin,
        cash_end: end,
        net_change: netChange,
        net_cash_from_operating: cfo,
        net_cash_from_investing: cfi,
        net_cash_from_financing: cff,
        reconciled,
      },
    };
  }

  async getFinancialCharts({ organizationId, ...query }) {
    const {
      from_date,
      to_date,
      interval = "month",
      include_zero = false,
      include_header = false,
      tax_rate = null,
      grouping = "excel",
      profit_basis = "after_tax",
      use_code_rule = false,
      include_virtual_profit = true,
      profit_mode = "net",
      include_details = false,
      cash_prefix = "11",
      cash_account_ids = null,
    } = query;

    const shared = { organizationId, from_date, to_date, interval };

    const income = await this.getIncomeStatementSeries({
      ...shared,
      include_zero,
      include_header,
      tax_rate,
      grouping,
    });

    const balance = await this.getBalanceSheetSeries({
      ...shared,
      include_zero,
      include_header,
      profit_basis,
    });

    const equity = await this.getEquityStatementSeries({
      ...shared,
      include_zero,
      include_header,
      use_code_rule,
      include_virtual_profit,
      profit_mode,
    });

    const cash = await this.getCashFlowSeries({
      ...shared,
      include_zero,
      include_details,
      cash_prefix,
      cash_account_ids,
    });

    return {
      period: { from_date, to_date },
      interval,
      income_statement: income,
      balance_sheet: balance,
      equity_statement: equity,
      cash_flow: cash,
    };
  }
}

module.exports = ChartsService;

