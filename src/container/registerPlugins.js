// src/container/registerPlugins.js
const accountsPlugin = require("../api/accounts");
const journalEntriesPlugin = require("../api/journalEntries");

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

    // nanti modul lain tinggal nambah di sini:
    // { plugin: journalsPlugin, options: {...} },
  ]);
}

module.exports = { registerPlugins };
