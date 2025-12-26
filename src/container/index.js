// src/container/index.js
const AuditLogService = require("../services/AuditLogService");
const AccountsService = require("../services/mssql/AccountsService");
const JournalEntriesService = require("../services/mssql/JournalEntriesService");
const BusinessPartnersService = require("../services/mssql/BusinessPartnersService");
const LedgersService = require("../services/mssql/LedgersService");
const TrialBalanceService = require("../services/TrialBalanceService");
const IncomeStatementService = require("../services/IncomeStatementService");

// validators (biasanya stateless)
const AccountsValidator = require("../validator/accounts");
const JournalEntriesValidator = require("../validator/journalEntries");
const BusinessPartnersValidator = require("../validator/businessPartners");
const OpeningBalancesValidator = require("../validator/openingBalances");
const LedgersValidator = require("../validator/ledgers");
const TrialBalanceValidator = require("../validator/trialBalance");
const IncomeStatementValidator = require("../validator/incomeStatement");

function createContainer() {
  // services dibuat sekali
  const auditLogService = new AuditLogService();
  const accountsService = new AccountsService();
  const journalEntriesService = new JournalEntriesService();
  const businessPartnersService = new BusinessPartnersService();
  const ledgersService = new LedgersService();
  const trialBalanceService = new TrialBalanceService();
  const incomeStatementService = new IncomeStatementService();

  return {
    // services
    auditLogService,
    accountsService,
    journalEntriesService,
    businessPartnersService,
    ledgersService,
    trialBalanceService,
    incomeStatementService,

    // validators
    accountsValidator: AccountsValidator,
    journalEntriesValidator: JournalEntriesValidator,
    businessPartnersValidator: BusinessPartnersValidator,
    openingBalancesValidator: OpeningBalancesValidator,
    ledgersValidator: LedgersValidator,
    trialBalanceValidator: TrialBalanceValidator,
    incomeStatementValidator: IncomeStatementValidator,
  };
}

module.exports = { createContainer };
