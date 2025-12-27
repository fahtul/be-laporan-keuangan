// src/container/registerPlugins.js
const accountsPlugin = require("../api/accounts");
const journalEntriesPlugin = require("../api/journalEntries");
const businessPartnersPlugins = require("../api/businessPartners");
const openingBalancesPlugin = require("../api/openingBalances");
const ledgersPlugin = require("../api/ledgers");
const trialBalancePlugin = require("../api/trialBalance");
const incomeStatementPlugin = require("../api/incomeStatement");
const balanceSheetPlugin = require("../api/balance-sheet");
const cashFlowPlugin = require("../api/cash-flow");
const worksheetsPlugin = require("../api/worksheets");
const equityStatementPlugin = require("../api/equity-statement");
const subledgersPlugin = require("../api/subledgers");
const closingsPlugin = require("../api/closings");

async function registerPlugins(server, container) {
  await server.register([
    {
      plugin: accountsPlugin,
      options: {
        service: container.accountsService,
        validator: container.accountsValidator,
        auditLogService: container.auditLogService,
      },
    },
    {
      plugin: journalEntriesPlugin,
      options: {
        service: container.journalEntriesService,
        validator: container.journalEntriesValidator,
        auditLogService: container.auditLogService,
      },
    },
    {
      plugin: businessPartnersPlugins,
      options: {
        service: container.businessPartnersService,
        validator: container.businessPartnersValidator,
        auditLogService: container.auditLogService,
      },
    },

    // ✅ Opening Balances (Neraca Awal / Saldo Awal)
    {
      plugin: openingBalancesPlugin,
      options: {
        // opening-balance pakai engine JournalEntriesService
        service: container.journalEntriesService,
        validator: container.openingBalancesValidator, // pastikan container punya ini
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: ledgersPlugin,
      options: {
        service: container.ledgersService,
        validator: container.ledgersValidator,
      },
    },

    {
      plugin: trialBalancePlugin,
      options: {
        service: container.trialBalanceService,
        validator: container.trialBalanceValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: incomeStatementPlugin,
      options: {
        service: container.incomeStatementService,
        validator: container.incomeStatementValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: balanceSheetPlugin,
      options: {
        service: container.balanceSheetService,
        validator: container.balanceSheetValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: cashFlowPlugin,
      options: {
        service: container.cashFlowService,
        validator: container.cashFlowValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: worksheetsPlugin,
      options: {
        service: container.worksheetsService,
        validator: container.worksheetsValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: equityStatementPlugin,
      options: {
        service: container.equityStatementService,
        validator: container.equityStatementValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: subledgersPlugin,
      options: {
        service: container.subledgersService,
        validator: container.subledgersValidator,
        auditLogService: container.auditLogService,
      },
    },

    {
      plugin: closingsPlugin,
      options: {
        service: container.closingsService,
        validator: container.closingsValidator,
        auditLogService: container.auditLogService,
      },
    },

    // nanti modul lain tinggal nambah di sini:
    // { plugin: journalsPlugin, options: {...} },
  ]);
}

module.exports = { registerPlugins };
