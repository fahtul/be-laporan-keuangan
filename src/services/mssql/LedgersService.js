const knex = require("../../database/knex"); // sesuaikan lokasi knex kamu
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

function normalBalanceFromType(type) {
  // asset/expense => debit, selain itu => credit
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

function oppositePos(pos) {
  return pos === "debit" ? "credit" : "debit";
}

function posFromSigned(signed, normalPos) {
  return signed >= 0 ? normalPos : oppositePos(normalPos);
}

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function deltaForLine({ debit, credit }, normalPos) {
  const d = Number(debit || 0);
  const c = Number(credit || 0);
  return normalPos === "debit" ? d - c : c - d;
}

class LedgersService {
  async getLedger({ organizationId, accountId, fromDate, toDate }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!accountId) throw new InvariantError("accountId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("fromDate and toDate are required");

    // fromDate/toDate expected "YYYY-MM-DD"
    // Lebih aman bandingkan string ISO date-only (lexicographically OK)
    if (String(fromDate) > String(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    // 1) Ambil akun (buat normal balance + info header)
    const account = await knex("accounts as a")
      .select("a.id", "a.code", "a.name", "a.type")
      .where("a.organization_id", organizationId)
      .whereNull("a.deleted_at")
      .andWhere("a.id", accountId)
      .first();

    if (!account) {
      throw new NotFoundError("Account not found");
    }

    const normalPos = normalBalanceFromType(account.type);

    // NOTE:
    // Fix bug tanggal "mundur 1 hari" dengan cara:
    // - Semua filter periode pakai je.date::date
    // - Semua output rows[].date dipaksa jadi string "YYYY-MM-DD" via to_char()
    const DATE_ONLY_EXPR = "je.date::date";
    const DATE_STR_EXPR = "to_char(je.date::date, 'YYYY-MM-DD')";

    // 2) OPENING SUM:
    // saldo sebelum periode = semua transaksi POSTED sebelum fromDate (date-only)
    const openingSum = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .andWhereRaw(`${DATE_ONLY_EXPR} < ?::date`, [fromDate])
      .select(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      )
      .first();

    const openingDebit = round2(openingSum?.sum_debit);
    const openingCredit = round2(openingSum?.sum_credit);

    let openingSigned = round2(
      deltaForLine({ debit: openingDebit, credit: openingCredit }, normalPos)
    );

    const openingPos = posFromSigned(openingSigned, normalPos);
    const openingAbs = round2(Math.abs(openingSigned));

    // 3) TRANSAKSI PERIODE:
    // include semua transaksi posted di range (date-only), termasuk entry_type='opening' pada fromDate
    const txRows = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .andWhereRaw(`${DATE_ONLY_EXPR} >= ?::date`, [fromDate])
      .andWhereRaw(`${DATE_ONLY_EXPR} <= ?::date`, [toDate])
      .select(
        "je.id as entry_id",
        knex.raw(`${DATE_STR_EXPR} as date`), // <-- selalu "YYYY-MM-DD" (string)
        "je.memo as entry_memo",
        "je.entry_type",
        "je.created_at as entry_created_at",
        "jl.id as line_id",
        "jl.memo as line_memo",
        "jl.debit",
        "jl.credit",
        "jl.created_at as line_created_at"
      )
      // urutan deterministik + opening duluan pada tanggal yang sama
      .orderByRaw(`${DATE_ONLY_EXPR} asc`)
      .orderByRaw(`CASE WHEN je.entry_type = 'opening' THEN 0 ELSE 1 END`)
      .orderBy("je.created_at", "asc")
      .orderBy("je.id", "asc")
      .orderBy("jl.created_at", "asc")
      .orderBy("jl.id", "asc");

    // 4) Hitung running balance
    let runningSigned = openingSigned;

    // baris pseudo OPEN (saldo sebelum periode) untuk FE biar mirip Excel
    const rows = [
      {
        kind: "opening",
        date: fromDate, // date-only, maknanya "saldo sebelum periode"
        ref: null,
        description: "Saldo sebelum periode",
        debit: 0,
        credit: 0,
        running_balance: openingAbs,
        running_pos: openingPos,
      },
    ];

    let periodDebit = 0;
    let periodCredit = 0;

    for (const r of txRows) {
      const debit = round2(r.debit);
      const credit = round2(r.credit);

      periodDebit += debit;
      periodCredit += credit;

      const delta = round2(deltaForLine({ debit, credit }, normalPos));
      runningSigned = round2(runningSigned + delta);

      const runningPos = posFromSigned(runningSigned, normalPos);
      const runningAbs = round2(Math.abs(runningSigned));

      const desc =
        (r.line_memo && String(r.line_memo).trim()) ||
        (r.entry_memo && String(r.entry_memo).trim()) ||
        "";

      rows.push({
        kind: "tx",
        date: r.date, // <-- sudah "YYYY-MM-DD" (string)
        ref: r.entry_id,
        entry_id: r.entry_id,
        entry_type: r.entry_type,
        description: desc,
        debit,
        credit,
        running_balance: runningAbs,
        running_pos: runningPos,
      });
    }

    periodDebit = round2(periodDebit);
    periodCredit = round2(periodCredit);

    const closingSigned = runningSigned;
    const closingPos = posFromSigned(closingSigned, normalPos);
    const closingAbs = round2(Math.abs(closingSigned));

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        normal_balance: normalPos,
      },
      period: { from_date: fromDate, to_date: toDate },
      opening: {
        sum_debit: openingDebit,
        sum_credit: openingCredit,
        balance: openingAbs,
        pos: openingPos,
      },
      totals: {
        period_debit: periodDebit,
        period_credit: periodCredit,
      },
      closing: {
        balance: closingAbs,
        pos: closingPos,
      },
      rows,
    };
  }
}

module.exports = LedgersService;
