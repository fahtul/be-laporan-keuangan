/**
 * Journal engine migrations (Postgres)
 * Tables:
 * - journal_entries
 * - journal_lines
 * - accounting_period_locks
 * - idempotency_keys
 */

exports.up = async function up(knex) {
  await knex.schema.createTable("journal_entries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.uuid("organization_id").notNullable();

    table.date("date").notNullable(); // posting date / journal date
    table.text("memo").nullable();

    // draft | posted | void
    table.string("status", 16).notNullable().defaultTo("draft");

    table.timestamp("posted_at").nullable();
    table.uuid("posted_by").nullable();

    table.timestamps(true, true); // created_at, updated_at
    table.timestamp("deleted_at").nullable();

    table.index(["organization_id", "date"], "journal_entries_org_date_idx");
    table.index(
      ["organization_id", "status"],
      "journal_entries_org_status_idx"
    );
  });

  // CHECK constraint for status
  await knex.raw(`
    ALTER TABLE journal_entries
    ADD CONSTRAINT journal_entries_status_check
    CHECK (status IN ('draft','posted','void'));
  `);

  await knex.schema.createTable("journal_lines", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.uuid("organization_id").notNullable();

    table.uuid("entry_id").notNullable();
    table
      .foreign("entry_id")
      .references("id")
      .inTable("journal_entries")
      .onDelete("CASCADE");

    table.uuid("account_id").notNullable();
    table
      .foreign("account_id")
      .references("id")
      .inTable("accounts")
      .onDelete("RESTRICT");

    table.decimal("debit", 18, 2).notNullable();
    table.decimal("credit", 18, 2).notNullable();

    table.text("memo").nullable();

    table.timestamps(true, true);
    table.timestamp("deleted_at").nullable();

    table.index(["organization_id", "entry_id"], "journal_lines_org_entry_idx");
    table.index(
      ["organization_id", "account_id"],
      "journal_lines_org_account_idx"
    );
  });

  // CHECK constraints for debit/credit logic:
  // - debit & credit >= 0
  // - exactly one side must be > 0 (XOR)
  await knex.raw(`
    ALTER TABLE journal_lines
    ADD CONSTRAINT journal_lines_amount_check
    CHECK (
      debit >= 0 AND credit >= 0 AND
      ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
    );
  `);

  await knex.schema.createTable("accounting_period_locks", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.uuid("organization_id").notNullable();

    table.date("period_start").notNullable();
    table.date("period_end").notNullable();

    table.boolean("is_closed").notNullable().defaultTo(false);
    table.timestamp("closed_at").nullable();
    table.uuid("closed_by").nullable();

    table.timestamps(true, true);
    table.timestamp("deleted_at").nullable();

    table.unique(
      ["organization_id", "period_start", "period_end"],
      "period_locks_org_range_unique"
    );

    table.index(
      ["organization_id", "is_closed", "period_start", "period_end"],
      "period_locks_org_closed_range_idx"
    );
  });

  await knex.raw(`
    ALTER TABLE accounting_period_locks
    ADD CONSTRAINT period_locks_range_check
    CHECK (period_end >= period_start);
  `);

  await knex.schema.createTable("idempotency_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.uuid("organization_id").notNullable();

    // scope contoh: "journal_entries.post"
    table.string("scope", 80).notNullable();

    // header Idempotency-Key
    table.string("idempotency_key", 200).notNullable();

    // optional: untuk memastikan request yg sama
    table.string("request_hash", 64).nullable();

    // store response for replay
    table.integer("response_status").nullable();
    table.jsonb("response_body").nullable();

    table.timestamps(true, true);

    table.unique(
      ["organization_id", "scope", "idempotency_key"],
      "idempotency_org_scope_key_unique"
    );

    table.index(
      ["organization_id", "scope", "created_at"],
      "idempotency_org_scope_created_idx"
    );
  });
};

exports.down = async function down(knex) {
  // drop tables in reverse order
  await knex.schema.dropTableIfExists("idempotency_keys");

  // drop constraints (optional; dropTable usually removes them, but safe)
  await knex.raw(
    `ALTER TABLE IF EXISTS accounting_period_locks DROP CONSTRAINT IF EXISTS period_locks_range_check;`
  );
  await knex.schema.dropTableIfExists("accounting_period_locks");

  await knex.raw(
    `ALTER TABLE IF EXISTS journal_lines DROP CONSTRAINT IF EXISTS journal_lines_amount_check;`
  );
  await knex.schema.dropTableIfExists("journal_lines");

  await knex.raw(
    `ALTER TABLE IF EXISTS journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check;`
  );
  await knex.schema.dropTableIfExists("journal_entries");
};
