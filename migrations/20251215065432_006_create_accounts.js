// migrations/006_create_accounts.js

exports.up = async (knex) => {
  await knex.schema.createTable("accounts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    t.uuid("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");

    t.string("code", 50).notNullable(); // fleksibel string
    t.string("name", 200).notNullable();

    // asset | liability | equity | revenue | expense
    t.string("type", 20).notNullable();

    // debit | credit
    t.string("normal_balance", 10).notNullable();

    // optional: hierarchical COA
    t.uuid("parent_id")
      .nullable()
      .references("id")
      .inTable("accounts")
      .onDelete("SET NULL");

    t.boolean("is_active").notNullable().defaultTo(true);

    t.timestamps(true, true); // created_at, updated_at (with timezone)
  });

  // Unique per org
  await knex.schema.alterTable("accounts", (t) => {
    t.unique(["organization_id", "code"], {
      indexName: "accounts_org_code_unique",
    });
    t.index(["organization_id", "type"], "accounts_org_type_idx");
    t.index(["organization_id", "is_active"], "accounts_org_active_idx");
  });

  // Optional tapi recommended: enforce normal_balance sesuai type
  // asset/expense => debit; liability/equity/revenue => credit
  await knex.raw(`
    ALTER TABLE accounts
    ADD CONSTRAINT accounts_normal_balance_check
    CHECK (
      (type IN ('asset','expense') AND normal_balance='debit')
      OR
      (type IN ('liability','equity','revenue') AND normal_balance='credit')
    );
  `);
};

exports.down = async (knex) => {
  await knex.raw(
    `ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_normal_balance_check;`
  );
  await knex.schema.dropTableIfExists("accounts");
};
