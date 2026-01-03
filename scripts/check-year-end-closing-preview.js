/* eslint-disable no-console */

/**
 * Minimal check script for "Preview closing" (GET /v1/closings/year-end).
 *
 * Usage:
 *   node scripts/check-year-end-closing-preview.js --org <ORG_UUID> --year 2025
 *
 * Requires DB env vars (same as app) to be set, e.g. via .env.
 */

const knex = require("../src/database/knex");
const ClosingsService = require("../src/services/ClosingsService");
const IncomeStatementService = require("../src/services/IncomeStatementService");

const toCents = (n) => Math.round(Number(n || 0) * 100);

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return v === undefined ? null : String(v).trim();
}

async function main() {
  const organizationId = getArg("--org");
  const year = getArg("--year");

  if (!organizationId || !year) {
    console.error("Missing args. Example: --org <UUID> --year 2025");
    process.exitCode = 2;
    return;
  }

  const closingsService = new ClosingsService();
  const incomeStatementService = new IncomeStatementService();

  const status = await closingsService.getYearEndStatus({ organizationId, year });

  const netIncomeSigned =
    status.net_income.side === "credit"
      ? Number(status.net_income.amount || 0)
      : -Number(status.net_income.amount || 0);

  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  const income = await incomeStatementService.getIncomeStatement({
    organizationId,
    fromDate,
    toDate,
    includeZero: false,
    includeHeader: false,
    taxRate: null,
    grouping: "simple",
  });

  const incomeNet = Number(income?.summary?.net_profit_after_tax || 0);

  const previewTotals = status.preview_entry?.totals || { debit: 0, credit: 0 };
  const balanced = toCents(previewTotals.debit) === toCents(previewTotals.credit);

  const matchesIncome = toCents(netIncomeSigned) === toCents(incomeNet);

  console.log("== Closing Preview Check ==");
  console.log({ organizationId, year });
  console.log("status.is_closed:", status.is_closed);
  console.log("retained_earnings_account:", status.retained_earnings_account?.code || null);
  console.log("net_income_signed (preview):", netIncomeSigned);
  console.log("net_profit_after_tax (income_statement):", incomeNet);
  console.log("preview_entry balanced:", balanced);
  console.log("net_income matches income_statement:", matchesIncome);

  if (!balanced) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await knex.destroy();
  });

