exports.up = async (knex) => {
  const hasBpId = await knex.schema.hasColumn("journal_lines", "bp_id");
  if (!hasBpId) {
    await knex.schema.alterTable("journal_lines", (t) => {
      t.uuid("bp_id").nullable();
      t
        .foreign("bp_id")
        .references("id")
        .inTable("business_partners")
        .onDelete("SET NULL");

      t.index(["organization_id", "bp_id"], "jl_org_bp_idx");
      t.index(["organization_id", "account_id", "bp_id"], "jl_org_acc_bp_idx");
      t.index(["entry_id", "bp_id"], "jl_entry_bp_idx");
    });
  } else {
    // ensure indexes exist (safe in Postgres)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS jl_org_bp_idx
      ON journal_lines(organization_id, bp_id);
    `);
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS jl_org_acc_bp_idx
      ON journal_lines(organization_id, account_id, bp_id);
    `);
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS jl_entry_bp_idx
      ON journal_lines(entry_id, bp_id);
    `);
  }
};

exports.down = async (knex) => {
  const hasBpId = await knex.schema.hasColumn("journal_lines", "bp_id");
  if (!hasBpId) return;

  await knex.schema.alterTable("journal_lines", (t) => {
    t.dropIndex(["organization_id", "bp_id"], "jl_org_bp_idx");
    t.dropIndex(["organization_id", "account_id", "bp_id"], "jl_org_acc_bp_idx");
    t.dropIndex(["entry_id", "bp_id"], "jl_entry_bp_idx");
    t.dropForeign(["bp_id"]);
    t.dropColumn("bp_id");
  });
};

