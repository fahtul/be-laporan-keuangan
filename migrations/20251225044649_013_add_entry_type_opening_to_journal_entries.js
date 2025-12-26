exports.up = async (knex) => {
  await knex.schema.alterTable("journal_entries", (t) => {
    t.string("entry_type", 20).notNullable().defaultTo("normal"); // normal|opening|reversal
    t.uuid("source_entry_id").nullable(); // untuk reversal (optional)
    t.string("opening_key", 20).nullable(); // mis. "2026"
  });

  await knex.schema.alterTable("journal_entries", (t) => {
    t.index(["organization_id", "entry_type"], "je_org_entry_type_idx");
    t.index(["organization_id", "source_entry_id"], "je_org_source_idx");
    t.index(["organization_id", "opening_key"], "je_org_opening_key_idx");
  });

  // Unique opening per org + opening_key (soft delete aware) - Postgres partial unique index
  const client = String(knex?.client?.config?.client || "");
  if (client.includes("pg")) {
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS je_opening_unique
      ON journal_entries (organization_id, opening_key)
      WHERE deleted_at IS NULL AND entry_type = 'opening'
    `);
  } else {
    // fallback non-pg (tetap ada check di service)
    await knex.schema.alterTable("journal_entries", (t) => {
      t.unique(
        ["organization_id", "opening_key", "entry_type"],
        "je_opening_unique_fallback"
      );
    });
  }
};

exports.down = async (knex) => {
  const client = String(knex?.client?.config?.client || "");
  if (client.includes("pg")) {
    await knex.raw(`DROP INDEX IF EXISTS je_opening_unique`);
  } else {
    await knex.schema.alterTable("journal_entries", (t) => {
      t.dropUnique(
        ["organization_id", "opening_key", "entry_type"],
        "je_opening_unique_fallback"
      );
    });
  }

  await knex.schema.alterTable("journal_entries", (t) => {
    t.dropIndex(["organization_id", "entry_type"], "je_org_entry_type_idx");
    t.dropIndex(["organization_id", "source_entry_id"], "je_org_source_idx");
    t.dropIndex(["organization_id", "opening_key"], "je_org_opening_key_idx");
  });

  await knex.schema.alterTable("journal_entries", (t) => {
    t.dropColumn("entry_type");
    t.dropColumn("source_entry_id");
    t.dropColumn("opening_key");
  });
};
