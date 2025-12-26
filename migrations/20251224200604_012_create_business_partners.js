exports.up = async function (knex) {
  await knex.schema.createTable("business_partners", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    table.uuid("organization_id").notNullable().index();

    table.string("code", 50).notNullable();
    table.string("name", 200).notNullable();

    // kategori pihak (opsional tapi sangat kepake untuk RS)
    table
      .enu(
        "category",
        [
          "customer",
          "supplier",
          "patient",
          "doctor",
          "insurer",
          "employee",
          "other",
        ],
        { useNative: true, enumName: "bp_category_enum" }
      )
      .notNullable()
      .defaultTo("other");

    // normal balance utk “pihak”: debit/credit (sesuai data kamu: Debet/Kredit)
    table
      .enu("normal_balance", ["debit", "credit"], {
        useNative: true,
        enumName: "bp_normal_balance_enum",
      })
      .notNullable()
      .defaultTo("debit");

    table.boolean("is_active").notNullable().defaultTo(true);

    // soft delete pattern (ngikutin accounts kamu)
    table.boolean("is_deleted").notNullable().defaultTo(false);
    table.timestamp("deleted_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // UNIQUE code per organization (tetap unik walau soft delete => user harus restore)
    table.unique(["organization_id", "code"], "uniq_bp_org_code");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("business_partners");
  await knex.raw('DROP TYPE IF EXISTS "bp_category_enum"');
  await knex.raw('DROP TYPE IF EXISTS "bp_normal_balance_enum"');
};
