exports.up = async (knex) => {
  await knex.schema.createTable("roles", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 50).notNullable().unique(); // admin/accountant/viewer
    t.timestamps(true, true);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("roles");
};
