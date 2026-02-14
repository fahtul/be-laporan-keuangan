exports.up = async (knex) => {
  const hasPlCategory = await knex.schema.hasColumn("accounts", "pl_category");

  if (!hasPlCategory) {
    await knex.schema.alterTable("accounts", (t) => {
      t.string("pl_category", 40).nullable();
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_pl_category_idx
    ON accounts(organization_id, pl_category);
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_pl_category_check'
      ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_pl_category_check
        CHECK (
          pl_category IS NULL OR
          pl_category IN (
            'revenue',
            'cogs',
            'opex',
            'depreciation_amortization',
            'non_operating',
            'other'
          )
        );
      END IF;
    END
    $$;
  `);
};

exports.down = async (knex) => {
  const hasPlCategory = await knex.schema.hasColumn("accounts", "pl_category");

  await knex.raw(`DROP INDEX IF EXISTS accounts_org_pl_category_idx;`);
  await knex.raw(
    `ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_pl_category_check;`
  );

  if (!hasPlCategory) return;

  await knex.schema.alterTable("accounts", (t) => {
    t.dropColumn("pl_category");
  });
};

