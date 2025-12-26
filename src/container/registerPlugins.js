// src/container/registerPlugins.js
const accountsPlugin = require("../api/accounts");
const journalEntriesPlugin = require("../api/journalEntries");
const businessPartnersPlugins = require("../api/businessPartners");
const openingBalancesPlugin = require("../api/openingBalances");
const ledgersPlugin = require("../api/ledgers");

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

    // nanti modul lain tinggal nambah di sini:
    // { plugin: journalsPlugin, options: {...} },
  ]);
}

module.exports = { registerPlugins };
