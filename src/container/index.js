// src/container/index.js
const AuditLogService = require("../services/AuditLogService");
const AccountsService = require("../services/mssql/AccountsService");
const JournalEntriesService = require("../services/mssql/JournalEntriesService");
const BusinessPartnersService = require("../services/mssql/BusinessPartnersService");
const LedgersService = require("../services/mssql/LedgersService");

// validators (biasanya stateless)
const AccountsValidator = require("../validator/accounts");
const JournalEntriesValidator = require("../validator/journalEntries");
const BusinessPartnersValidator = require("../validator/businessPartners");
const OpeningBalancesValidator = require("../validator/openingBalances");
const LedgersValidator = require("../validator/ledgers");

function createContainer() {
  // services dibuat sekali
  const auditLogService = new AuditLogService();
  const accountsService = new AccountsService();
  const journalEntriesService = new JournalEntriesService();
  const businessPartnersService = new BusinessPartnersService();
  const ledgersService = new LedgersService();

  return {
    // services
    auditLogService,
    accountsService,
    journalEntriesService,
    businessPartnersService,
    ledgersService,

    // validators
    accountsValidator: AccountsValidator,
    journalEntriesValidator: JournalEntriesValidator,
    businessPartnersValidator: BusinessPartnersValidator,
    openingBalancesValidator: OpeningBalancesValidator,
    ledgersValidator: LedgersValidator,
  };
}

module.exports = { createContainer };
