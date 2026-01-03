const knex = require("../database/knex");
const InvariantError = require("../exceptions/InvariantError");

function round2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function toCents(n) {
  return Math.round(Number(n || 0) * 100);
}

function fromCents(c) {
  return round2(Number(c || 0) / 100);
}

function addDaysYmd(ymd, deltaDays) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeActivity(cfActivity, code) {
  const cfa = String(cfActivity || "").trim().toLowerCase();
  if (cfa === "operating" || cfa === "investing" || cfa === "financing")
    return cfa;

  const c = String(code || "").trim();
  // fallback minimal (boleh kamu perluas)
  if (c.startsWith("4") || c.startsWith("5")) return "operating";
  return "operating";
}

class CashFlowService {
  async _resolveCashAccounts({
    organizationId,
    cashAccountIds = null,
    cashPrefix = "11",
  }) {
    if (cashAccountIds && cashAccountIds.length > 0) {
      // explicit list: jangan paksa is_postable (biar user bisa override)
      return knex("accounts")
        .select("id", "code", "name")
        .where("organization_id", organizationId)
        .whereNull("deleted_at")
        .whereIn("id", cashAccountIds)
        .orderBy("code", "asc");
    }

    const prefix = String(cashPrefix || "11").trim() || "11";
    const prefixLike = `${prefix}%`;

    // IMPORTANT: hanya akun postable supaya header (mis 1100) tidak ikut
    return knex("accounts")
      .select("id", "code", "name")
      .where("organization_id", organizationId)
      .whereNull("deleted_at")
      .andWhere("is_postable", true)
      .andWhere((qb) => {
        qb.where("cf_activity", "cash").orWhere((q2) => {
          q2.whereNull("cf_activity").andWhere((q3) => {
            q3.where("code", "like", prefixLike)
              .orWhereRaw("LOWER(name) LIKE '%kas%'")
              .orWhereRaw("LOWER(name) LIKE '%bank%'");
          });
        });
      })
      .orderBy("code", "asc");
  }

  async _cashBalanceSignedAsOf({ organizationId, cashAccountIds, asOf }) {
    if (!cashAccountIds || cashAccountIds.length === 0) return 0;

    const row = await knex("journal_lines as jl")
      .join("journal_entries as je", "je.id", "jl.entry_id")
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .whereIn("jl.account_id", cashAccountIds)
      .andWhere("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      // DATE-ONLY compare (Postgres)
      .andWhereRaw("je.date::date <= ?::date", [String(asOf).trim()])
      .first(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    const debit = Number(row?.sum_debit || 0);
    const credit = Number(row?.sum_credit || 0);
    // cash normal balance = debit
    return round2(debit - credit);
  }

  // BEGINNING cash = saldo sebelum fromDate + opening entry tepat di fromDate
  // (opening entry tidak boleh masuk mutasi cashflow)
  async _cashBeginningSigned({ organizationId, cashAccountIds, fromDate }) {
    if (!cashAccountIds || cashAccountIds.length === 0) return 0;

    const fd = String(fromDate).trim();

    const row = await knex("journal_lines as jl")
      .join("journal_entries as je", "je.id", "jl.entry_id")
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .whereIn("jl.account_id", cashAccountIds)
      .andWhere("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      .andWhere((qb) => {
        // strictly before fromDate
        qb.whereRaw("je.date::date < ?::date", [fd]).orWhere((q2) => {
          // include opening exactly on fromDate
          q2.where("je.entry_type", "opening").andWhereRaw(
            "je.date::date = ?::date",
            [fd]
          );
        });
      })
      .first(
        knex.raw("COALESCE(SUM(jl.debit), 0) as sum_debit"),
        knex.raw("COALESCE(SUM(jl.credit), 0) as sum_credit")
      );

    const debit = Number(row?.sum_debit || 0);
    const credit = Number(row?.sum_credit || 0);
    return round2(debit - credit);
  }

  async getCashFlow({
    organizationId,
    fromDate,
    toDate,
    includeZero = false,
    includeDetails = true,
    cashAccountIds = null,
    cashPrefix = "11",
  }) {
    if (!organizationId) throw new InvariantError("organizationId is required");
    if (!fromDate || !toDate)
      throw new InvariantError("from_date and to_date are required");
    if (new Date(fromDate) > new Date(toDate)) {
      throw new InvariantError("from_date must be <= to_date");
    }

    const fd = String(fromDate).trim();
    const td = String(toDate).trim();

    const openingAsOf = addDaysYmd(fd, -1);
    const endingAsOf = td;
    if (!openingAsOf) throw new InvariantError("Invalid from_date");

    const cashAccounts = await this._resolveCashAccounts({
      organizationId,
      cashAccountIds,
      cashPrefix,
    });
    const cashIds = cashAccounts.map((a) => a.id);
    const cashIdSet = new Set(cashIds);

    // FIX: beginning includes opening entry on fromDate
    const beginCash = await this._cashBeginningSigned({
      organizationId,
      cashAccountIds: cashIds,
      fromDate: fd,
    });

    const endCashActual = await this._cashBalanceSignedAsOf({
      organizationId,
      cashAccountIds: cashIds,
      asOf: endingAsOf,
    });

    if (cashIds.length === 0) {
      const netChange = 0;
      const endCashCalc = round2(beginCash + netChange);
      const difference = round2(endCashActual - endCashCalc);
      return {
        period: {
          from_date: fd,
          to_date: td,
          opening_as_of: openingAsOf,
          ending_as_of: endingAsOf,
        },
        cash_accounts: [],
        cash: {
          begin: beginCash,
          end: endCashActual,
          change: round2(endCashActual - beginCash),
        },
        activities: {
          operating: { total: 0, items: [] },
          investing: { total: 0, items: [] },
          financing: { total: 0, items: [] },
          transfers: { total: 0 },
        },
        totals: {
          net_cash_from_operating: 0,
          net_cash_from_investing: 0,
          net_cash_from_financing: 0,
          net_change: netChange,
          end_cash_calc: endCashCalc,
        },
        reconciliation: {
          end_cash_actual: endCashActual,
          end_cash_calc: endCashCalc,
          difference,
          reconciled: Math.abs(difference) < 0.01,
        },
      };
    }

    // Load posted journal lines within period for entries that have at least one cash line.
    // IMPORTANT: exclude entry_type opening/closing from cashflow movements.
    const lines = await knex("journal_lines as jl")
      .join("journal_entries as je", "je.id", "jl.entry_id")
      .join("accounts as a", "a.id", "jl.account_id")
      .where("jl.organization_id", organizationId)
      .whereNull("jl.deleted_at")
      .andWhere("je.organization_id", organizationId)
      .whereNull("je.deleted_at")
      .andWhere("je.status", "posted")
      // DATE-ONLY range
      .andWhereRaw("je.date::date >= ?::date", [fd])
      .andWhereRaw("je.date::date <= ?::date", [td])
      // keep null entry_type, but exclude opening/closing
      .andWhere((qb) => {
        qb.whereNull("je.entry_type").orWhereNotIn("je.entry_type", [
          "opening",
          "closing",
        ]);
      })
      .whereExists(function cashExists() {
        this.select(1)
          .from("journal_lines as jl2")
          .whereRaw("jl2.entry_id = jl.entry_id")
          .andWhere("jl2.organization_id", organizationId)
          .whereNull("jl2.deleted_at")
          .whereIn("jl2.account_id", cashIds);
      })
      .select(
        "je.id as entry_id",
        knex.raw("je.date::date as entry_date"),
        "je.created_at as entry_created_at",
        "je.entry_type",
        "jl.id as line_id",
        "jl.account_id",
        "jl.debit",
        "jl.credit",
        "a.code as account_code",
        "a.name as account_name",
        "a.cf_activity as account_cf_activity"
      )
      .orderByRaw("je.date::date asc")
      .orderBy("je.created_at", "asc")
      .orderBy("jl.created_at", "asc")
      .orderBy("jl.id", "asc");

    const entries = new Map();
    for (const r of lines) {
      const id = r.entry_id;
      if (!entries.has(id)) {
        entries.set(id, {
          entry_id: id,
          date: r.entry_date,
          created_at: r.entry_created_at,
          entry_type: r.entry_type,
          lines: [],
        });
      }
      entries.get(id).lines.push({
        line_id: r.line_id,
        account_id: r.account_id,
        debit: round2(r.debit),
        credit: round2(r.credit),
        account_code: r.account_code,
        account_name: r.account_name,
        account_cf_activity: r.account_cf_activity,
      });
    }

    const activityTotalsCents = {
      operating: 0,
      investing: 0,
      financing: 0,
    };
    const activityItems = {
      operating: new Map(),
      investing: new Map(),
      financing: new Map(),
    };

    let transfersTotal = 0;

    for (const e of entries.values()) {
      const cashLines = e.lines.filter((l) => cashIdSet.has(l.account_id));
      const nonCashLines = e.lines.filter((l) => !cashIdSet.has(l.account_id));

      const cashEffect = round2(
        cashLines.reduce(
          (acc, l) => acc + (Number(l.debit || 0) - Number(l.credit || 0)),
          0
        )
      );

      const isCashOnly = cashLines.length > 0 && nonCashLines.length === 0;

      // cash-to-cash transfer (cashEffect 0)
      if (cashEffect === 0) {
        if (isCashOnly) {
          const moved = round2(
            cashLines.reduce(
              (acc, l) =>
                acc + Math.abs(Number(l.debit || 0) - Number(l.credit || 0)),
              0
            ) / 2
          );
          transfersTotal = round2(transfersTotal + moved);
        }
        continue;
      }

      if (nonCashLines.length === 0) {
        // Fallback: no counterpart lines -> operating
        activityTotalsCents.operating += toCents(cashEffect);
        continue;
      }

      const weighted = nonCashLines.map((l) => {
        const activity = normalizeActivity(l.account_cf_activity, l.account_code);
        const weight = Number(l.debit || 0) + Number(l.credit || 0);
        return { ...l, activity, weight };
      });

      const totalWeight = weighted.reduce(
        (acc, l) => acc + Number(l.weight || 0),
        0
      );
      if (totalWeight <= 0) {
        activityTotalsCents.operating += toCents(cashEffect);
        continue;
      }

      const cashEffectCents = toCents(cashEffect);
      let allocatedCents = 0;

      for (let i = 0; i < weighted.length; i += 1) {
        const l = weighted[i];
        const isLast = i === weighted.length - 1;

        const ratio = Number(l.weight || 0) / totalWeight;
        let lineCents = isLast
          ? cashEffectCents - allocatedCents
          : Math.round(cashEffectCents * ratio);

        allocatedCents += lineCents;

        const act = l.activity;
        activityTotalsCents[act] += lineCents;

        if (includeDetails) {
          const key = l.account_id;
          const existing = activityItems[act].get(key);
          if (existing) {
            existing.amount_cents += lineCents;
          } else {
            activityItems[act].set(key, {
              account_id: l.account_id,
              code: String(l.account_code || "").trim(),
              name: l.account_name,
              amount_cents: lineCents,
            });
          }
        }
      }
    }

    const buildActivity = (key) => {
      const total = fromCents(activityTotalsCents[key]);
      let items = [];

      if (includeDetails) {
        items = Array.from(activityItems[key].values()).map((it) => ({
          account_id: it.account_id,
          code: it.code,
          name: it.name,
          amount: fromCents(it.amount_cents),
        }));

        if (!includeZero) items = items.filter((it) => it.amount !== 0);

        items.sort((a, b) => {
          const c = String(a.code || "").localeCompare(String(b.code || ""), "en", {
            numeric: true,
          });
          if (c !== 0) return c;
          return String(a.name || "").localeCompare(String(b.name || ""), "en");
        });
      }

      return { total, items };
    };

    const operating = buildActivity("operating");
    const investing = buildActivity("investing");
    const financing = buildActivity("financing");

    const netChange = round2(
      operating.total + investing.total + financing.total
    );
    const endCashCalc = round2(beginCash + netChange);
    const difference = round2(endCashActual - endCashCalc);

    return {
      period: {
        from_date: fd,
        to_date: td,
        opening_as_of: openingAsOf,
        ending_as_of: endingAsOf,
      },
      cash_accounts: cashAccounts,
      cash: {
        begin: beginCash,
        end: endCashActual,
        change: round2(endCashActual - beginCash),
      },
      activities: {
        operating,
        investing,
        financing,
        transfers: { total: transfersTotal },
      },
      totals: {
        net_cash_from_operating: operating.total,
        net_cash_from_investing: investing.total,
        net_cash_from_financing: financing.total,
        net_change: netChange,
        end_cash_calc: endCashCalc,
      },
      reconciliation: {
        end_cash_actual: endCashActual,
        end_cash_calc: endCashCalc,
        difference,
        reconciled: Math.abs(difference) < 0.01,
      },
    };
  }
}

module.exports = CashFlowService;
