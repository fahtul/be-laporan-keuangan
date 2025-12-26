exports.up = async function (knex) {
  await knex.schema.alterTable("journal_entries", (t) => {
    t.uuid("reversal_of_id").nullable();

    t.index(["organization_id", "reversal_of_id"], "je_org_reversal_of_idx");

    t.foreign("reversal_of_id", "je_reversal_of_fk")
      .references("id")
      .inTable("journal_entries")
      .onDelete("SET NULL");
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("journal_entries", (t) => {
    t.dropForeign("reversal_of_id", "je_reversal_of_fk");
    t.dropIndex(
      ["organization_id", "reversal_of_id"],
      "je_org_reversal_of_idx"
    );
    t.dropColumn("reversal_of_id");
  });
};
