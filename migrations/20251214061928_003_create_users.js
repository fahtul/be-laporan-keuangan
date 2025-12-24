exports.up = async (knex) => {
  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    t.uuid("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("RESTRICT");

    t.uuid("role_id")
      .notNullable()
      .references("id")
      .inTable("roles")
      .onDelete("RESTRICT");

    t.string("fullname", 150).notNullable();
    t.string("email", 150).notNullable();
    t.string("password_hash", 255).notNullable();

    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("token_version").notNullable().defaultTo(0);

    t.timestamps(true, true);

    t.unique(["organization_id", "email"]);
    t.index(["organization_id"]);
    t.index(["role_id"]);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("users");
};
