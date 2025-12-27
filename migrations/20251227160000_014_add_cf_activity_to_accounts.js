exports.up = async (knex) => {
  const hasCfActivity = await knex.schema.hasColumn("accounts", "cf_activity");

  if (!hasCfActivity) {
    await knex.schema.alterTable("accounts", (t) => {
      t.string("cf_activity", 20).nullable();
      t.index(["organization_id", "cf_activity"], "accounts_org_cf_activity_idx");
    });
  } else {
    // ensure index exists (safe in Postgres)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS accounts_org_cf_activity_idx
      ON accounts(organization_id, cf_activity);
    `);
  }

  // Minimal backfill: detect cash/bank by code prefix or name.
  await knex("accounts")
    .whereNull("cf_activity")
    .andWhere((qb) => {
      qb.where("code", "like", "11%")
        .orWhereRaw("LOWER(name) LIKE '%kas%'")
        .orWhereRaw("LOWER(name) LIKE '%bank%'");
    })
    .update({ cf_activity: "cash" });
};

exports.down = async (knex) => {
  const hasCfActivity = await knex.schema.hasColumn("accounts", "cf_activity");
  if (!hasCfActivity) return;

  await knex.schema.alterTable("accounts", (t) => {
    t.dropIndex(["organization_id", "cf_activity"], "accounts_org_cf_activity_idx");
    t.dropColumn("cf_activity");
  });
};

