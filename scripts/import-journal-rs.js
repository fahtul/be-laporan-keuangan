/**
 * Import Journal Entries + Lines (Rumah Sakit) dari CSV delimiter ';'
 * Tabel:
 * - journal_entries: id, organization_id, date, memo, status, posted_at, posted_by, created_at, updated_at, deleted_at
 * - journal_lines  : id, organization_id, entry_id, account_id, debit, credit, memo, created_at, updated_at, deleted_at
 *
 * Idempotent:
 * - Entry dicari berdasarkan (organization_id, date, memo prefix [REF])
 * - Jika lines untuk entry_id sudah ada, skip insert lines
 *
 * PowerShell:
 *  $env:ORGANIZATION_ID="..."; node scripts/import-journal-rs.js .\journal_entries_rs.csv .\journal_lines_rs.csv
 *
 * Optional:
 *  $env:POSTED_BY="users--xxx"   (kalau mau isi posted_by)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ✅ sesuaikan jika path knex kamu beda
const knex = require("../src/database/knex");

function parseCSV(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (!lines.length) return [];

  const header = lines[0].split(";").map((x) => x.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";").map((x) => x.trim());
    if (cols.length < header.length) continue;

    const row = {};
    for (let h = 0; h < header.length; h++) row[header[h]] = cols[h];
    rows.push(row);
  }
  return rows;
}

function toNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Nilai angka tidak valid: "${v}"`);
  return n;
}

function normalizeStatus(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (!s) return "posted";
  return s;
}

function buildEntryMemo(refNo, memo) {
  const base = String(memo || "").trim();
  const prefix = `[${refNo}]`;
  if (base.startsWith(prefix)) return base;
  return `${prefix} ${base}`.trim();
}

async function main() {
  const orgId = process.env.ORGANIZATION_ID;
  const postedBy = process.env.POSTED_BY || null;

  const entriesFile = process.argv[2];
  const linesFile = process.argv[3];

  if (!orgId) throw new Error("ENV ORGANIZATION_ID wajib diisi.");
  if (!entriesFile || !linesFile) {
    throw new Error(
      "Pemakaian: node scripts/import-journal-rs.js <journal_entries_rs.csv> <journal_lines_rs.csv>"
    );
  }

  const entriesPath = path.resolve(process.cwd(), entriesFile);
  const linesPath = path.resolve(process.cwd(), linesFile);

  const entries = parseCSV(fs.readFileSync(entriesPath, "utf8"));
  const lines = parseCSV(fs.readFileSync(linesPath, "utf8"));

  if (!entries.length) throw new Error("journal_entries_rs.csv kosong.");
  if (!lines.length) throw new Error("journal_lines_rs.csv kosong.");

  // Preload accounts: code -> id
  const accounts = await knex("accounts")
    .select("id", "code")
    .where({ organization_id: orgId })
    .whereNull("deleted_at");

  const accountIdByCode = new Map(accounts.map((a) => [String(a.code), a.id]));

  // Group lines by ref_no
  const linesByRef = new Map();
  for (const l of lines) {
    const ref = l.ref_no;
    if (!ref) continue;
    if (!linesByRef.has(ref)) linesByRef.set(ref, []);
    linesByRef.get(ref).push(l);
  }

  // Validasi balance + account exist
  for (const e of entries) {
    const ref = e.ref_no;
    const entryLines = linesByRef.get(ref) || [];
    if (!entryLines.length)
      throw new Error(`Lines tidak ditemukan untuk ref_no: ${ref}`);

    let dr = 0;
    let cr = 0;

    for (const ln of entryLines) {
      const accCode = String(ln.account_code);
      const accId = accountIdByCode.get(accCode);
      if (!accId)
        throw new Error(
          `Account code tidak ditemukan di accounts: ${accCode} (ref_no ${ref})`
        );

      dr += toNumber(ln.debit);
      cr += toNumber(ln.credit);
    }

    if (dr !== cr)
      throw new Error(
        `Journal tidak balance untuk ${ref}. Debit=${dr} Credit=${cr}`
      );
  }

  const now = new Date();

  await knex.transaction(async (trx) => {
    const entryIdByRef = new Map();

    let insertedEntries = 0;
    let reusedEntries = 0;
    let insertedLines = 0;
    let skippedLines = 0;

    // 1) Insert / reuse journal_entries
    for (const e of entries) {
      const ref = e.ref_no;
      const status = normalizeStatus(e.status);
      const memoStored = buildEntryMemo(ref, e.memo);

      // idempotent match: org + date + memo prefix
      const existing = await trx("journal_entries")
        .select("id")
        .where({ organization_id: orgId })
        .where("date", e.date)
        .where("memo", memoStored)
        .whereNull("deleted_at")
        .first();

      if (existing) {
        entryIdByRef.set(ref, existing.id);
        reusedEntries++;
        continue;
      }

      const entryId = crypto.randomUUID();

      const payload = {
        id: entryId,
        organization_id: orgId,
        date: e.date,
        memo: memoStored,
        status,
        posted_at: status === "posted" ? now : null,
        posted_by: status === "posted" ? postedBy : null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };

      await trx("journal_entries").insert(payload);
      entryIdByRef.set(ref, entryId);
      insertedEntries++;
    }

    // 2) Insert lines per entry (skip kalau sudah ada lines)
    for (const e of entries) {
      const ref = e.ref_no;
      const entryId = entryIdByRef.get(ref);
      const entryLines = linesByRef.get(ref) || [];

      const cnt = await trx("journal_lines")
        .count("* as cnt")
        .where({ organization_id: orgId, entry_id: entryId })
        .whereNull("deleted_at")
        .first();

      if (Number(cnt?.cnt || 0) > 0) {
        skippedLines += entryLines.length;
        continue;
      }

      for (const ln of entryLines) {
        const accId = accountIdByCode.get(String(ln.account_code));

        await trx("journal_lines").insert({
          id: crypto.randomUUID(),
          organization_id: orgId,
          entry_id: entryId,
          account_id: accId,
          debit: toNumber(ln.debit),
          credit: toNumber(ln.credit),
          memo: ln.line_memo || "",
          created_at: now,
          updated_at: now,
          deleted_at: null,
        });

        insertedLines++;
      }
    }

    console.log(
      `✅ Import Journal selesai.
- Entries inserted: ${insertedEntries}
- Entries reused : ${reusedEntries}
- Lines inserted : ${insertedLines}
- Lines skipped  : ${skippedLines}`
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Gagal import:", err.message);
    process.exit(1);
  });
