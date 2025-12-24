exports.up = async (knex) => {
  // Optional tapi strongly recommended: batasi nilai type
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_type_check'
      ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_type_check
        CHECK (type IN ('asset','liability','equity','revenue','expense'));
      END IF;
    END$$;
  `);

  // Batasi normal_balance
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_normal_balance_check'
      ) THEN
        ALTER TABLE accounts
        ADD CONSTRAINT accounts_normal_balance_check
        CHECK (normal_balance IN ('debit','credit'));
      END IF;
    END$$;
  `);

  // Function: set normal_balance from type
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_accounts_normal_balance()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.type IN ('asset','expense') THEN
        NEW.normal_balance := 'debit';
      ELSIF NEW.type IN ('liability','equity','revenue') THEN
        NEW.normal_balance := 'credit';
      ELSE
        RAISE EXCEPTION 'Invalid account type: %', NEW.type;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Trigger: before insert/update
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_accounts_normal_balance ON accounts;

    CREATE TRIGGER trg_accounts_normal_balance
    BEFORE INSERT OR UPDATE OF type
    ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_accounts_normal_balance();
  `);

  // Backfill existing rows (in case some old data)
  await knex.raw(`
    UPDATE accounts
    SET normal_balance =
      CASE
        WHEN type IN ('asset','expense') THEN 'debit'
        WHEN type IN ('liability','equity','revenue') THEN 'credit'
        ELSE normal_balance
      END
    WHERE normal_balance IS NULL OR normal_balance NOT IN ('debit','credit');
  `);
};

exports.down = async (knex) => {
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_accounts_normal_balance ON accounts;`
  );
  await knex.raw(`DROP FUNCTION IF EXISTS set_accounts_normal_balance();`);

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_type_check') THEN
        ALTER TABLE accounts DROP CONSTRAINT accounts_type_check;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_normal_balance_check') THEN
        ALTER TABLE accounts DROP CONSTRAINT accounts_normal_balance_check;
      END IF;
    END$$;
  `);
};
