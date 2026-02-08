// src/container/index.js
const AuditLogService = require("../services/AuditLogService");
const AccountsService = require("../services/mssql/AccountsService");
const JournalEntriesService = require("../services/mssql/JournalEntriesService");
const BusinessPartnersService = require("../services/mssql/BusinessPartnersService");
const LedgersService = require("../services/mssql/LedgersService");
const TrialBalanceService = require("../services/TrialBalanceService");
const IncomeStatementService = require("../services/IncomeStatementService");
const BalanceSheetService = require("../services/BalanceSheetService");
const CashFlowService = require("../services/CashFlowService");
const WorksheetsService = require("../services/WorksheetsService");
const EquityStatementService = require("../services/EquityStatementService");
const SubledgersService = require("../services/SubledgersService");
const ClosingsService = require("../services/ClosingsService");
const ChartsService = require("../services/ChartsService");

// validators (biasanya stateless)
const AccountsValidator = require("../validator/accounts");
const JournalEntriesValidator = require("../validator/journalEntries");
const BusinessPartnersValidator = require("../validator/businessPartners");
const OpeningBalancesValidator = require("../validator/openingBalances");
const LedgersValidator = require("../validator/ledgers");
const TrialBalanceValidator = require("../validator/trialBalance");
const IncomeStatementValidator = require("../validator/incomeStatement");
const BalanceSheetValidator = require("../api/balance-sheet/validator");
const CashFlowValidator = require("../api/cash-flow/validator");
const WorksheetsValidator = require("../api/worksheets/validator");
const EquityStatementValidator = require("../api/equity-statement/validator");
const SubledgersValidator = require("../api/subledgers/validator");
const ClosingsValidator = require("../api/closings/validator");
const ChartsValidator = require("../api/charts/validator");

function createContainer() {
  // services dibuat sekali
  const auditLogService = new AuditLogService();
  const accountsService = new AccountsService();
  const journalEntriesService = new JournalEntriesService();
  const businessPartnersService = new BusinessPartnersService();
  const ledgersService = new LedgersService();
  const trialBalanceService = new TrialBalanceService();
  const incomeStatementService = new IncomeStatementService();
  const balanceSheetService = new BalanceSheetService();
  const cashFlowService = new CashFlowService();
  const worksheetsService = new WorksheetsService();
  const equityStatementService = new EquityStatementService({
    incomeStatementService: incomeStatementService,
  });
  const subledgersService = new SubledgersService();
  const closingsService = new ClosingsService();
  const chartsService = new ChartsService({
    incomeStatementService,
    balanceSheetService,
    equityStatementService,
    cashFlowService,
  });

  return {
    // services
    auditLogService,
    accountsService,
    journalEntriesService,
    businessPartnersService,
    ledgersService,
    trialBalanceService,
    incomeStatementService,
    balanceSheetService,
    cashFlowService,
    worksheetsService,
    equityStatementService,
    subledgersService,
    closingsService,
    chartsService,

    // validators
    accountsValidator: AccountsValidator,
    journalEntriesValidator: JournalEntriesValidator,
    businessPartnersValidator: BusinessPartnersValidator,
    openingBalancesValidator: OpeningBalancesValidator,
    ledgersValidator: LedgersValidator,
    trialBalanceValidator: TrialBalanceValidator,
    incomeStatementValidator: IncomeStatementValidator,
    balanceSheetValidator: BalanceSheetValidator,
    cashFlowValidator: CashFlowValidator,
    worksheetsValidator: WorksheetsValidator,
    equityStatementValidator: EquityStatementValidator,
    subledgersValidator: SubledgersValidator,
    closingsValidator: ClosingsValidator,
    chartsValidator: ChartsValidator,
  };
}

module.exports = { createContainer };
