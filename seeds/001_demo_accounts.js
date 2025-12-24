exports.seed = async function (knex) {
  const orgId =
    process.env.SEED_ORG_ID ||
    (await knex("organizations").select("id").first())?.id;

  if (!orgId) throw new Error("SEED_ORG_ID missing / organizations empty.");

  // bersihkan demo sebelumnya
  await knex("accounts")
    .where({ organization_id: orgId })
    .andWhere("code", "like", "DEMO-%")
    .del();

  const types = ["asset", "liability", "equity", "revenue", "expense"];
  const perType = Number(process.env.SEED_PER_TYPE || 30);
  const now = knex.fn.now();

  const rows = [];

  for (const t of types) {
    const prefix = t.slice(0, 3).toUpperCase();
    const normalBalance = t === "asset" || t === "expense" ? "debit" : "credit";

    for (let i = 1; i <= perType; i++) {
      rows.push({
        id: knex.raw("gen_random_uuid()"),
        organization_id: orgId,
        code: `DEMO-${prefix}-${String(i).padStart(4, "0")}`,
        name: `Demo ${t} account ${i}`,
        type: t,

        // ✅ wajib karena NOT NULL
        normal_balance: normalBalance,

        is_active: true,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  // insert batch
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await knex("accounts").insert(rows.slice(i, i + chunkSize));
  }

  console.log(
    `✅ Seed accounts demo done. orgId=${orgId}, total=${rows.length}`
  );
};
