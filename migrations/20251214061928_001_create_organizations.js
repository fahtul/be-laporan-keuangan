exports.up = async (knex) => {
  await knex.schema.createTable("organizations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 150).notNullable();
    t.string("slug", 80).notNullable().unique();
    t.timestamps(true, true);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("organizations");
};
