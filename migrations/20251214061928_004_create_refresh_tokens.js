exports.up = async (knex) => {
  await knex.schema.createTable("refresh_tokens", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    t.uuid("organization_id").notNullable().index();
    t.uuid("user_id").notNullable().index();

    // store HASHED refresh token (not plain)
    t.string("token_hash", 255).notNullable().unique();

    t.timestamp("expires_at").notNullable();
    t.timestamp("revoked_at").nullable();

    t.string("user_agent", 255).nullable();
    t.string("ip", 64).nullable();

    t.timestamps(true, true);

    t.foreign("organization_id")
      .references("organizations.id")
      .onDelete("CASCADE");
    t.foreign("user_id").references("users.id").onDelete("CASCADE");
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("refresh_tokens");
};
