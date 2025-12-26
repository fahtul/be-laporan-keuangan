/**
 * Import COA Rumah Sakit dari CSV (delimiter ;)
 * Cocok untuk tabel accounts dengan kolom:
 * id, organization_id, code, name, type, normal_balance, parent_id,
 * is_active, is_postable, created_at, updated_at, deleted_at
 *
 * Jalankan:
 * ORGANIZATION_ID="uuid-org" node scripts/import-coa-rs.js ./coa_rumah_sakit.csv
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ✅ SESUAIKAN PATH KNEX PROJECT KAMU
// opsi A (umum di project service): const knex = require("../database/knex");
const knex = require("../src/database/knex");
// opsi B: const knex = require("../src/database/knex");

const ALLOWED_TYPES = new Set([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

function parseYaTidak(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (["ya", "y", "true", "1"].includes(s)) return true;
  if (["tidak", "t", "false", "0", ""].includes(s)) return false;
  return false;
}

function parseCSV(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (!lines.length) return [];

  const header = lines[0].split(";").map((x) => x.trim());
  const idx = (name) => header.indexOf(name);

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((x) => x.trim());

    const row = {
      code: cols[idx("code")] || "",
      name: cols[idx("name")] || "",
      type: cols[idx("type")] || "",
      parent_code: cols[idx("parent_code")] || "",
      is_postable: parseYaTidak(cols[idx("is_postable")]),
      normal_balance: (cols[idx("normal_balance")] || "").toLowerCase(),
      is_active: parseYaTidak(cols[idx("is_active")]),
    };

    if (!row.code || !row.name) continue;
    out.push(row);
  }
  return out;
}

async function main() {
  const organizationId = process.env.ORGANIZATION_ID;
  const csvFile = process.argv[2];

  if (!organizationId) throw new Error("ENV ORGANIZATION_ID wajib diisi.");
  if (!csvFile)
    throw new Error(
      "Path CSV wajib diisi. Contoh: node scripts/import-coa-rs.js ./coa_rumah_sakit.csv"
    );

  const csvPath = path.resolve(process.cwd(), csvFile);
  const csv = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(csv);

  // validasi
  for (const r of rows) {
    if (!ALLOWED_TYPES.has(r.type))
      throw new Error(`Type tidak valid untuk code ${r.code}: ${r.type}`);
    if (!["debit", "credit"].includes(r.normal_balance)) {
      throw new Error(
        `normal_balance tidak valid untuk code ${r.code}: ${r.normal_balance}`
      );
    }
  }

  const now = new Date();

  await knex.transaction(async (trx) => {
    // cache code->id (biar parent resolve cepat)
    const idByCode = new Map();

    const existing = await trx("accounts")
      .select("id", "code")
      .where({ organization_id: organizationId })
      .whereNull("deleted_at");

    for (const e of existing) idByCode.set(String(e.code), e.id);

    let inserted = 0;
    let updated = 0;

    for (const r of rows) {
      const parentId = r.parent_code
        ? idByCode.get(r.parent_code) || null
        : null;

      // kalau ada parent_code tapi parent tidak ketemu, anggap error biar struktur gak rusak
      if (r.parent_code && !parentId) {
        throw new Error(
          `Parent code ${r.parent_code} untuk akun ${r.code} tidak ditemukan (urutannya harus parent dulu).`
        );
      }

      const found = await trx("accounts")
        .select("id", "created_at")
        .where({
          organization_id: organizationId,
          code: r.code,
        })
        .first();

      const payload = {
        organization_id: organizationId,
        code: r.code,
        name: r.name,
        type: r.type,
        normal_balance: r.normal_balance,
        parent_id: parentId,
        is_postable: r.is_postable,
        is_active: r.is_active,
        updated_at: now,
        deleted_at: null,
      };

      if (found) {
        await trx("accounts").where({ id: found.id }).update(payload);
        idByCode.set(r.code, found.id);
        updated++;
      } else {
        const id = crypto.randomUUID();
        await trx("accounts").insert({
          id,
          ...payload,
          created_at: now,
        });
        idByCode.set(r.code, id);
        inserted++;
      }
    }

    console.log(
      `✅ Import COA selesai. Insert: ${inserted}, Update: ${updated}, Total: ${rows.length}`
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Gagal import:", err.message);
    process.exit(1);
  });
