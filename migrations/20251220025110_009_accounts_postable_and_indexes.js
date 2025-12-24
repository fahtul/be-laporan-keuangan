exports.up = async (knex) => {
  // add is_postable (default false untuk safety: akun baru biasanya header dulu)
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='accounts' AND column_name='is_postable'
      ) THEN
        ALTER TABLE accounts
        ADD COLUMN is_postable boolean NOT NULL DEFAULT false;
      END IF;
    END$$;
  `);

  // Unique code per organization hanya untuk data yang belum soft delete
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_code_unique_live
    ON accounts(organization_id, code)
    WHERE deleted_at IS NULL;
  `);

  // Index untuk list + pagination
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_deleted_idx
    ON accounts(organization_id, deleted_at);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_org_active_idx
    ON accounts(organization_id, is_active)
    WHERE deleted_at IS NULL;
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_parent_idx
    ON accounts(parent_id)
    WHERE deleted_at IS NULL;
  `);
};

exports.down = async (knex) => {
  await knex.raw(`DROP INDEX IF EXISTS accounts_parent_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_active_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_deleted_idx;`);
  await knex.raw(`DROP INDEX IF EXISTS accounts_org_code_unique_live;`);

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='accounts' AND column_name='is_postable'
      ) THEN
        ALTER TABLE accounts DROP COLUMN is_postable;
      END IF;
    END$$;
  `);
};
