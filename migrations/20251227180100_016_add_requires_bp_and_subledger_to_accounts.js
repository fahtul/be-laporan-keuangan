exports.up = async (knex) => {
  const hasRequiresBp = await knex.schema.hasColumn("accounts", "requires_bp");
  const hasSubledger = await knex.schema.hasColumn("accounts", "subledger");

  if (!hasRequiresBp || !hasSubledger) {
    await knex.schema.alterTable("accounts", (t) => {
      if (!hasRequiresBp) t.boolean("requires_bp").notNullable().defaultTo(false);
      if (!hasSubledger) t.string("subledger", 10).nullable();
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_requires_bp_idx
    ON accounts(organization_id, requires_bp);
  `);
};

exports.down = async (knex) => {
  const hasRequiresBp = await knex.schema.hasColumn("accounts", "requires_bp");
  const hasSubledger = await knex.schema.hasColumn("accounts", "subledger");

  await knex.raw(`DROP INDEX IF EXISTS accounts_org_requires_bp_idx;`);

  if (!hasRequiresBp && !hasSubledger) return;

  await knex.schema.alterTable("accounts", (t) => {
    if (hasSubledger) t.dropColumn("subledger");
    if (hasRequiresBp) t.dropColumn("requires_bp");
  });
};

