exports.up = async (knex) => {
  await knex.schema.createTable("audit_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    t.uuid("organization_id").notNullable().index();
    t.uuid("actor_id").notNullable().index();

    t.string("action", 80).notNullable(); // journal.post, period.close, account.create
    t.string("entity", 80).notNullable(); // journal_entry, period, account
    t.string("entity_id", 80).nullable();

    t.jsonb("before").nullable();
    t.jsonb("after").nullable();

    t.string("ip", 64).nullable();
    t.string("user_agent", 255).nullable();

    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    t.foreign("organization_id")
      .references("organizations.id")
      .onDelete("CASCADE");
    t.foreign("actor_id").references("users.id").onDelete("RESTRICT");
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("audit_logs");
};
