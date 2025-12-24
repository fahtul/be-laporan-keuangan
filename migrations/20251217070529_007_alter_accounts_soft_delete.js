exports.up = async (knex) => {
  const hasIsActive = await knex.schema.hasColumn("accounts", "is_active");
  const hasDeletedAt = await knex.schema.hasColumn("accounts", "deleted_at");

  // tambah kolom yang belum ada saja
  if (!hasIsActive || !hasDeletedAt) {
    await knex.schema.alterTable("accounts", (t) => {
      if (!hasIsActive) t.boolean("is_active").notNullable().defaultTo(true);
      if (!hasDeletedAt) t.timestamp("deleted_at", { useTz: true }).nullable();
    });
  }

  // indexes (Postgres supports IF NOT EXISTS)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_code_idx
    ON accounts (organization_id, code);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_name_idx
    ON accounts (organization_id, name);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_type_idx
    ON accounts (organization_id, type);
  `);

  // optional: unique code per org for active rows only (soft delete friendly)
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_code_unique_active
    ON accounts (organization_id, code)
    WHERE deleted_at IS NULL;
  `);
};

exports.down = async (knex) => {
  // drop indexes
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_code_unique_active;`);
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_code_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_name_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_type_idx;`);

  // drop columns if exist
  const hasDeletedAt = await knex.schema.hasColumn("accounts", "deleted_at");
  if (hasDeletedAt) {
    await knex.schema.alterTable("accounts", (t) => t.dropColumn("deleted_at"));
  }

  // is_active biasanya sudah dipakai fitur lain; kalau memang mau di-drop:
  // const hasIsActive = await knex.schema.hasColumn("accounts", "is_active");
  // if (hasIsActive) await knex.schema.alterTable("accounts", (t) => t.dropColumn("is_active"));
};
