const knex = require("../../database/knex"); // sesuaikan lokasi knex kamu
const NotFoundError = require("../../exceptions/NotFoundError");
const InvariantError = require("../../exceptions/InvariantError");

function normalBalanceFromType(type) {
  // sama seperti FE kamu: asset/expense => debit, selain itu => credit
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
    if (new Date(fromDate) > new Date(toDate)) {
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
      // kalau kamu tidak punya NotFoundError, ganti jadi InvariantError("Account not found")
      throw new NotFoundError("Account not found");
    }

    const normalPos = normalBalanceFromType(account.type);

    // 2) Opening sums = semua transaksi POSTED sebelum fromDate
    const openingSum = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .andWhere("je.date", "<", fromDate)
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

    // 3) Ambil transaksi dalam range (POSTED)
    const txRows = await knex("journal_entries as je")
      .join("journal_lines as jl", "jl.entry_id", "je.id")
      .where("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("jl.account_id", accountId)
      .andWhere("je.date", ">=", fromDate)
      .andWhere("je.date", "<=", toDate)
      .select(
        "je.id as entry_id",
        "je.date",
        "je.memo as entry_memo",
        "je.entry_type",
        "je.created_at as entry_created_at",
        "jl.id as line_id",
        "jl.memo as line_memo",
        "jl.debit",
        "jl.credit",
        "jl.created_at as line_created_at"
      )
      // urutan deterministik biar running balance konsisten
      .orderBy("je.date", "asc")
      .orderBy("je.created_at", "asc")
      .orderBy("je.id", "asc")
      .orderBy("jl.created_at", "asc")
      .orderBy("jl.id", "asc");

    // 4) Hitung running balance
    let runningSigned = openingSigned;

    // optional: bikin 1 baris pseudo "Saldo awal" biar FE mirip Excel
    const rows = [
      {
        kind: "opening",
        date: fromDate,
        ref: null,
        description: "Saldo awal",
        debit: 0,
        credit: 0,
        running_balance: openingAbs,
        running_pos: openingPos, // Debet/Kredit
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

      rows.push({
        kind: "tx",
        date: r.date,
        ref: r.entry_id, // "Bukti transaksi" (kalau kamu punya entry_no, bisa diganti)
        entry_id: r.entry_id,
        entry_type: r.entry_type,
        description: r.line_memo || r.entry_memo || "",
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
        normal_balance: normalPos, // debit/credit
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
