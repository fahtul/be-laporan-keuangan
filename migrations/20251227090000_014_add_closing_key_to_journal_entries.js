exports.up = async (knex) => {
  const hasClosingKey = await knex.schema.hasColumn(
    "journal_entries",
    "closing_key"
  );

  if (!hasClosingKey) {
    await knex.schema.alterTable("journal_entries", (t) => {
      t.string("closing_key", 20).nullable(); // e.g. "2025"
    });
  }

  const client = String(knex?.client?.config?.client || "");

  if (client.includes("pg")) {
    // Ensure useful indexes exist (safe if already present)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS je_org_entry_type_idx
      ON journal_entries (organization_id, entry_type);
    `);

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS je_org_closing_key_idx
      ON journal_entries (organization_id, closing_key);
    `);

    // Ensure only 1 closing per org per year key
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS je_closing_unique
      ON journal_entries (organization_id, closing_key)
      WHERE deleted_at IS NULL
        AND entry_type = 'closing'
        AND closing_key IS NOT NULL;
    `);
  } else {
    // Fallback for non-pg (migration runs once; ok to create)
    await knex.schema.alterTable("journal_entries", (t) => {
      t.index(["organization_id", "closing_key"], "je_org_closing_key_idx");
      t.unique(
        ["organization_id", "closing_key", "entry_type"],
        "je_closing_unique_fallback"
      );
    });
  }
};

exports.down = async (knex) => {
  const client = String(knex?.client?.config?.client || "");

  if (client.includes("pg")) {
    await knex.raw(`DROP INDEX IF EXISTS je_closing_unique;`);
    await knex.raw(`DROP INDEX IF EXISTS je_org_closing_key_idx;`);
    // Do not drop je_org_entry_type_idx here because it may be created by previous migrations.
  } else {
    await knex.schema.alterTable("journal_entries", (t) => {
      t.dropUnique(
        ["organization_id", "closing_key", "entry_type"],
        "je_closing_unique_fallback"
      );
      t.dropIndex(["organization_id", "closing_key"], "je_org_closing_key_idx");
    });
  }

  const hasClosingKey = await knex.schema.hasColumn(
    "journal_entries",
    "closing_key"
  );
  if (hasClosingKey) {
    await knex.schema.alterTable("journal_entries", (t) => {
      t.dropColumn("closing_key");
    });
  }
};

