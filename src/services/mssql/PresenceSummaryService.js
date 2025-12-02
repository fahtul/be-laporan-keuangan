// // src/services/mysql/PresenceSummaryService.js
// const database = require("../../database");

// /** ---- Config: late penalty tiers (adjust as needed) ---- */
// const LATE_PENALTY_TIERS = [
//   { max: 10, amount: 5000 },
//   { max: 20, amount: 10000 },
//   { max: 40, amount: 25000 },
//   { max: Infinity, amount: 50000 },
// ];

// /** ---- Helpers ---- */
// function computeLatePenalty(minutes) {
//   for (const t of LATE_PENALTY_TIERS) if (minutes <= t.max) return t.amount;
//   return 0;
// }
// function isCutiByReason(reason) {
//   if (!reason) return false;
//   const r = String(reason).toLowerCase();
//   return r.includes("cuti") || r.includes("leave");
// }
// // Accept DATE/DATETIME as string or Date; return 'YYYY-MM-DD' or null
// function toDateOnlyString(val) {
//   if (!val) return null;
//   if (val instanceof Date) return val.toISOString().slice(0, 10);
//   if (typeof val === "string") {
//     const m = val.match(/^\d{4}-\d{2}-\d{2}/);
//     if (m) return m[0];
//     const d = new Date(val.replace(" ", "T"));
//     return isNaN(d) ? null : d.toISOString().slice(0, 10);
//   }
//   const d = new Date(val);
//   return isNaN(d) ? null : d.toISOString().slice(0, 10);
// }
// // Accept DATETIME as string or Date; return Date or null
// function toJSDateTime(val) {
//   if (!val) return null;
//   if (val instanceof Date) return val;
//   if (typeof val === "string") {
//     const d = new Date(val.replace(" ", "T"));
//     return isNaN(d) ? null : d;
//   }
//   const d = new Date(val);
//   return isNaN(d) ? null : d;
// }
// // Make Date from 'YYYY-MM-DD' + 'HH:MM:SS'
// function makeDateTimeFromDateAndTime(dateStr, timeStr) {
//   if (!dateStr || !timeStr) return null;
//   const d = new Date(`${dateStr}T${timeStr}`);
//   return isNaN(d) ? null : d;
// }

// /** Detect OFF category based on your tables (IDs, names, times) */
// function isOffCategory({ cat_id, cat_name, time_start, time_end }) {
//   const id = String(cat_id || "").toLowerCase();
//   const name = String(cat_name || "").toLowerCase();

//   // Explicit IDs you showed
//   const OFF_IDS = new Set([
//     "cat-holiday",
//     "cat-time_off",
//     "cat-manual",
//     "dayoff",
//   ]);
//   if (OFF_IDS.has(id)) return true;

//   // Name keywords (Holiday, Day Off, Time Off, Libur, Manual Attendance)
//   if (
//     /(^|\s)(holiday|day\s*off|time\s*off|off|libur|manual\s+attendance)(\s|$)/i.test(
//       name
//     )
//   ) {
//     return true;
//   }

//   // Heuristic: 00:00:00 .. 23:59:00/59 is usually an off/non-working placeholder
//   if (
//     (time_start === "00:00:00" || !time_start) &&
//     (time_end === "23:59:00" || time_end === "23:59:59")
//   ) {
//     return true;
//   }

//   return false;
// }

// /** Build period from YM or explicit range */
// function buildPeriod({ year, month, fromDate, toDate }) {
//   if (fromDate && toDate) {
//     const a = new Date(fromDate);
//     const b = new Date(toDate);
//     const start = a <= b ? a : b;
//     const end = a <= b ? b : a;
//     const startDate = toDateOnlyString(start);
//     const endDate = toDateOnlyString(end);
//     return {
//       mode: "range",
//       startDate,
//       endDate,
//       startDT: `${startDate} 00:00:00`,
//       endDT: `${endDate} 23:59:59`,
//     };
//   }
//   // calendar month
//   const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
//   const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
//   const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
//   return {
//     mode: "month",
//     startDate: fmt(start).slice(0, 10),
//     endDate: fmt(end).slice(0, 10),
//     startDT: fmt(start),
//     endDT: fmt(end),
//   };
// }

// class PresenceSummaryService {
//   constructor() {
//     this._db = database.getConnection();
//   }

//   /** Summary for month or range */
//   async getSummary({ year, month, fromDate, toDate, group = "user" }) {
//     const period = buildPeriod({ year, month, fromDate, toDate });
//     const { startDate, endDate, startDT, endDT } = period;

//     // Schedules with category
//     const [schedules] = await this._db.query(
//       `SELECT us.user_id, us.date,
//             sc.id AS cat_id, sc.name AS cat_name,
//             sc.time_start, sc.time_end
//      FROM user_schedules us
//      JOIN schedule_categories sc ON sc.id = us.category_id
//      JOIN users u ON u.id = us.user_id AND u.is_active = 1
//      WHERE us.date BETWEEN ? AND ?`,
//       [startDate, endDate]
//     );

//     // First check-in
//     const [checkins] = await this._db.query(
//       `SELECT a.user_id, DATE(a.recorded_at) AS d, MIN(a.recorded_at) AS first_checkin
//      FROM attendances a
//      JOIN users u ON u.id = a.user_id AND u.is_active = 1
//      WHERE a.type='checkin' AND a.recorded_at BETWEEN ? AND ?
//      GROUP BY a.user_id, d`,
//       [startDT, endDT]
//     );

//     // Names & tolerances
//     const [tolerances] = await this._db.query(
//       `SELECT u.id AS user_id, u.fullname, COALESCE(lt.minutes,0) AS tol_minutes
//      FROM users u
//      LEFT JOIN late_tolerances lt ON lt.id = u.late_tolerance_id
//      WHERE u.is_active = 1`
//     );

//     // Approved requests
//     const [requests] = await this._db.query(
//       `SELECT r.id, r.user_id, r.type, r.reason, r.status,
//             r.request_date,
//             COALESCE(r.request_end_date, r.request_date) AS request_end_date
//      FROM requests r
//      JOIN users u ON u.id = r.user_id AND u.is_active = 1
//      WHERE r.status='approved' AND (
//        (r.request_date BETWEEN ? AND ?) OR
//        (COALESCE(r.request_end_date, r.request_date) BETWEEN ? AND ?) OR
//        (r.request_date <= ? AND COALESCE(r.request_end_date, r.request_date) >= ?)
//      )`,
//       [startDate, endDate, startDate, endDate, startDate, endDate]
//     );

//     // Indexes
//     const tolByUser = new Map();
//     const nameByUser = new Map();
//     tolerances.forEach((r) => {
//       tolByUser.set(r.user_id, Number(r.tol_minutes || 0));
//       nameByUser.set(r.user_id, r.fullname);
//     });

//     const firstCheckinMap = new Map(); // `${uid}|${date}` -> Date
//     checkins.forEach((c) => {
//       const dStr = toDateOnlyString(c.d);
//       const dt = toJSDateTime(c.first_checkin);
//       if (dStr && dt) firstCheckinMap.set(`${c.user_id}|${dStr}`, dt);
//     });

//     // Expand requests → per user per day
//     const excused = new Map(); // uid -> Map(ds -> { izin,cuti,sick })
//     const addExcuse = (uid, ds, kind) => {
//       if (!excused.has(uid)) excused.set(uid, new Map());
//       const prev = excused.get(uid).get(ds) || {
//         izin: false,
//         cuti: false,
//         sick: false,
//       };
//       prev[kind] = true;
//       excused.get(uid).set(ds, prev);
//     };
//     for (const r of requests) {
//       const kind =
//         r.type === "sick"
//           ? "sick"
//           : r.type === "time_off"
//           ? isCutiByReason(r.reason)
//             ? "cuti"
//             : "izin"
//           : null;
//       if (!kind) continue;

//       const start = toDateOnlyString(r.request_date);
//       const end = toDateOnlyString(r.request_end_date);
//       if (!start || !end) continue;

//       let cur = new Date(`${start}T00:00:00`);
//       const e = new Date(`${end}T00:00:00`);
//       while (cur <= e) {
//         const ds = toDateOnlyString(cur);
//         if (ds >= startDate && ds <= endDate) addExcuse(r.user_id, ds, kind);
//         cur.setDate(cur.getDate() + 1);
//       }
//     }

//     // Aggregators
//     const perUser = new Map(); // user view
//     const getUser = (uid) => {
//       if (!perUser.has(uid))
//         perUser.set(uid, {
//           user_id: uid,
//           fullname: nameByUser.get(uid) || uid,
//           izin_days: 0,
//           cuti_days: 0,
//           sakit_days: 0,
//           late_count: 0,
//           late_minutes_total: 0,
//           late_nominal_total: 0,
//           alfa_days: 0,
//           izin_dates: [],
//           cuti_dates: [],
//           sakit_dates: [],
//           alfa_dates: [],
//           late_days: [], // { date, minutes, nominal, first_checkin, scheduled_start, tolerance_min }
//         });
//       return perUser.get(uid);
//     };

//     const perDate = new Map(); // daily view
//     const getDay = (ds) => {
//       if (!perDate.has(ds))
//         perDate.set(ds, {
//           date: ds,
//           users_count: 0,
//           izin_days: 0,
//           cuti_days: 0,
//           sakit_days: 0,
//           late_count: 0,
//           late_minutes_total: 0,
//           late_nominal_total: 0,
//           alfa_days: 0,
//           // breakdown
//           users_izin: [], // [{user_id, fullname}]
//           users_cuti: [],
//           users_sakit: [],
//           users_late: [], // [{user_id, fullname, minutes, nominal, first_checkin, scheduled_start, tolerance_min}]
//           users_alfa: [], // [{user_id, fullname}]
//         });
//       return perDate.get(ds);
//     };

//     // Iterate schedules
//     for (const s of schedules) {
//       const uid = s.user_id;
//       const ds = toDateOnlyString(s.date);
//       if (!ds) continue;

//       const offDay = isOffCategory({
//         cat_id: s.cat_id,
//         cat_name: s.cat_name,
//         time_start: s.time_start,
//         time_end: s.time_end,
//       });
//       if (offDay) continue; // ignore off/holiday/manual

//       const excuse = excused.get(uid)?.get(ds) || {
//         izin: false,
//         cuti: false,
//         sick: false,
//       };

//       // === Per-user aggregation ===
//       const U = getUser(uid);

//       // === Per-day aggregation ===
//       const D = getDay(ds);
//       // Count this user in users_count for the day (once per scheduled user-day).
//       D.users_count += 1;

//       // Excuses (workdays only)
//       if (excuse.izin) {
//         U.izin_days++;
//         U.izin_dates.push(ds);
//         D.izin_days++;
//         D.users_izin.push({ user_id: uid, fullname: U.fullname });
//       }
//       if (excuse.cuti) {
//         U.cuti_days++;
//         U.cuti_dates.push(ds);
//         D.cuti_days++;
//         D.users_cuti.push({ user_id: uid, fullname: U.fullname });
//       }
//       if (excuse.sick) {
//         U.sakit_days++;
//         U.sakit_dates.push(ds);
//         D.sakit_days++;
//         D.users_sakit.push({ user_id: uid, fullname: U.fullname });
//       }

//       if (excuse.izin || excuse.cuti || excuse.sick) continue;

//       const fc = firstCheckinMap.get(`${uid}|${ds}`);
//       if (!fc) {
//         U.alfa_days++;
//         U.alfa_dates.push(ds);
//         D.alfa_days++;
//         D.users_alfa.push({ user_id: uid, fullname: U.fullname });
//         continue;
//       }

//       if (s.time_start) {
//         const tol = tolByUser.get(uid) || 0;
//         const sched = makeDateTimeFromDateAndTime(ds, s.time_start);
//         if (sched) {
//           const schedTol = new Date(sched.getTime() + tol * 60000);
//           const diffMs = fc.getTime() - schedTol.getTime();
//           if (diffMs > 0) {
//             const lateMin = Math.ceil(diffMs / 60000);
//             const nominal = computeLatePenalty(lateMin);

//             U.late_count++;
//             U.late_minutes_total += lateMin;
//             U.late_nominal_total += nominal;
//             U.late_days.push({
//               date: ds,
//               minutes: lateMin,
//               nominal,
//               first_checkin: fc.toISOString().slice(11, 19),
//               scheduled_start: s.time_start,
//               tolerance_min: tol,
//             });

//             D.late_count++;
//             D.late_minutes_total += lateMin;
//             D.late_nominal_total += nominal;
//             D.users_late.push({
//               user_id: uid,
//               fullname: U.fullname,
//               minutes: lateMin,
//               nominal,
//               first_checkin: fc.toISOString().slice(11, 19),
//               scheduled_start: s.time_start,
//               tolerance_min: tol,
//             });
//           }
//         }
//       }
//     }

//     // Build response
//     let items;
//     if (group === "day") {
//       items = Array.from(perDate.values()).sort((a, b) =>
//         (a.date || "").localeCompare(b.date || "")
//       );
//     } else {
//       items = Array.from(perUser.values()).sort((a, b) =>
//         (a.fullname || "").localeCompare(b.fullname || "")
//       );
//     }

//     const totals = items.reduce(
//       (acc, it) => {
//         if (group === "day") {
//           acc.users += it.users_count;
//           acc.izin_days += it.izin_days;
//           acc.cuti_days += it.cuti_days;
//           acc.sakit_days += it.sakit_days;
//           acc.late_count += it.late_count;
//           acc.late_minutes_total += it.late_minutes_total;
//           acc.late_nominal_total += it.late_nominal_total;
//           acc.alfa_days += it.alfa_days;
//         } else {
//           acc.users += 1;
//           acc.izin_days += it.izin_days;
//           acc.cuti_days += it.cuti_days;
//           acc.sakit_days += it.sakit_days;
//           acc.late_count += it.late_count;
//           acc.late_minutes_total += it.late_minutes_total;
//           acc.late_nominal_total += it.late_nominal_total;
//           acc.alfa_days += it.alfa_days;
//         }
//         return acc;
//       },
//       {
//         users: 0,
//         izin_days: 0,
//         cuti_days: 0,
//         sakit_days: 0,
//         late_count: 0,
//         late_minutes_total: 0,
//         late_nominal_total: 0,
//         alfa_days: 0,
//       }
//     );

//     return {
//       mode: period.mode,
//       group, // <-- 'user' or 'day'
//       year: year ?? null,
//       month: month ?? null,
//       from_date: period.mode === "range" ? startDate : null,
//       to_date: period.mode === "range" ? endDate : null,
//       count: items.length,
//       totals,
//       items,
//     };
//   }

//   /** Detail for month or range */
//   async getUserDetail({ userId, year, month, fromDate, toDate }) {
//     const period = buildPeriod({ year, month, fromDate, toDate });
//     const { startDate, endDate, startDT, endDT } = period;

//     const [[userRow]] = await this._db.query(
//       `SELECT u.id AS user_id, u.fullname, COALESCE(lt.minutes,0) AS tol_minutes
// FROM users u
// LEFT JOIN late_tolerances lt ON lt.id = u.late_tolerance_id
// WHERE u.id = ? AND u.is_active = 1
// LIMIT 1`,
//       [userId]
//     );
//     if (!userRow) {
//       return {
//         user_id: userId,
//         fullname: userId,
//         mode: period.mode,
//         from_date: startDate,
//         to_date: endDate,
//         days: [],
//       };
//     }

//     const [schedules] = await this._db.query(
//       `SELECT us.date,
//        sc.id AS cat_id, sc.name AS cat_name,
//        sc.time_start, sc.time_end
// FROM user_schedules us
// JOIN schedule_categories sc ON sc.id = us.category_id
// JOIN users u ON u.id = us.user_id AND u.is_active = 1
// WHERE us.user_id = ? AND us.date BETWEEN ? AND ?`,
//       [userId, startDate, endDate]
//     );

//     const [checkins] = await this._db.query(
//       `SELECT DATE(a.recorded_at) AS d, MIN(a.recorded_at) AS first_checkin
// FROM attendances a
// JOIN users u ON u.id = a.user_id AND u.is_active = 1
// WHERE a.user_id = ? AND a.type = 'checkin'
//   AND a.recorded_at BETWEEN ? AND ?
// GROUP BY d`,
//       [userId, startDT, endDT]
//     );
//     const fcMap = new Map(
//       checkins.map((r) => {
//         const dStr = toDateOnlyString(r.d);
//         const dt = toJSDateTime(r.first_checkin);
//         return [dStr, dt];
//       })
//     );

//     const [requests] = await this._db.query(
//       `SELECT r.type, r.reason, r.request_date,
//        COALESCE(r.request_end_date, r.request_date) AS request_end_date
// FROM requests r
// JOIN users u ON u.id = r.user_id AND u.is_active = 1
// WHERE r.user_id = ?
//   AND r.status = 'approved'
//   AND (
//     (r.request_date BETWEEN ? AND ?) OR
//     (COALESCE(r.request_end_date, r.request_date) BETWEEN ? AND ?) OR
//     (r.request_date <= ? AND COALESCE(r.request_end_date, r.request_date) >= ?)
//   )`,
//       [userId, startDate, endDate, startDate, endDate, startDate, endDate]
//     );

//     const excused = new Map();
//     const mark = (ds, kind) => {
//       const prev = excused.get(ds) || { izin: false, cuti: false, sick: false };
//       prev[kind] = true;
//       excused.set(ds, prev);
//     };
//     for (const r of requests) {
//       const kind =
//         r.type === "sick"
//           ? "sick"
//           : r.type === "time_off"
//           ? isCutiByReason(r.reason)
//             ? "cuti"
//             : "izin"
//           : null;
//       if (!kind) continue;

//       const start = toDateOnlyString(r.request_date);
//       const end = toDateOnlyString(r.request_end_date);
//       if (!start || !end) continue;

//       let cur = new Date(`${start}T00:00:00`);
//       const ed = new Date(`${end}T00:00:00`);
//       while (cur <= ed) {
//         const ds = toDateOnlyString(cur);
//         if (ds >= startDate && ds <= endDate) mark(ds, kind);
//         cur.setDate(cur.getDate() + 1);
//       }
//     }

//     const tol = Number(userRow.tol_minutes || 0);
//     const days = [];
//     let totals = {
//       izin: 0,
//       cuti: 0,
//       sick: 0,
//       late_count: 0,
//       late_minutes: 0,
//       late_nominal: 0,
//       alfa: 0,
//     };

//     for (const s of schedules) {
//       const ds = toDateOnlyString(s.date);
//       if (!ds) continue;

//       const offDay = isOffCategory({
//         cat_id: s.cat_id,
//         cat_name: s.cat_name,
//         time_start: s.time_start,
//         time_end: s.time_end,
//       });

//       const ex = excused.get(ds) || { izin: false, cuti: false, sick: false };
//       const fc = fcMap.get(ds);

//       const row = {
//         date: ds,
//         category_id: s.cat_id,
//         category_name: s.cat_name,
//         time_start: s.time_start,
//         time_end: s.time_end,
//         off_day: offDay,
//         excuse: ex,
//         first_checkin: fc ? fc.toISOString().slice(11, 19) : null,
//         late_minutes: 0,
//         late_nominal: 0,
//         status: null,
//       };

//       // OPTION A (recommended): OFF → status=off, skip counting excuses/late/alfa
//       if (offDay) {
//         row.status = "off";
//         days.push(row);
//         continue;
//       }

//       // Working day: count excuses if present
//       if (ex.izin || ex.cuti || ex.sick) {
//         row.status = ex.sick ? "sick" : ex.cuti ? "cuti" : "izin";
//         if (ex.izin) totals.izin++;
//         if (ex.cuti) totals.cuti++;
//         if (ex.sick) totals.sick++;
//         days.push(row);
//         continue;
//       }

//       // No excuse: alfa if no checkin
//       if (!fc) {
//         row.status = "alfa";
//         totals.alfa++;
//         days.push(row);
//         continue;
//       }

//       // Lateness vs scheduled start + tolerance
//       if (s.time_start) {
//         const sched = makeDateTimeFromDateAndTime(ds, s.time_start);
//         if (sched) {
//           const schedTol = new Date(sched.getTime() + tol * 60000);
//           const diff = fc.getTime() - schedTol.getTime();
//           if (diff > 0) {
//             const lateMin = Math.ceil(diff / 60000);
//             row.late_minutes = lateMin;
//             row.late_nominal = computeLatePenalty(lateMin);
//             row.status = "late";
//             totals.late_count++;
//             totals.late_minutes += lateMin;
//             totals.late_nominal += row.late_nominal;
//           } else {
//             row.status = "ontime";
//           }
//         } else {
//           row.status = "ontime";
//         }
//       } else {
//         row.status = "ontime";
//       }

//       days.push(row);
//     }

//     return {
//       user_id: userRow.user_id,
//       fullname: userRow.fullname,
//       mode: period.mode,
//       year: year ?? null,
//       month: month ?? null,
//       from_date: period.mode === "range" ? startDate : null,
//       to_date: period.mode === "range" ? endDate : null,
//       totals,
//       days,
//     };
//   }
// }

// module.exports = PresenceSummaryService;
// src/services/mysql/PresenceSummaryService.js
const database = require("../../database");

/** ---- Config: late/early penalty tiers (adjust as needed) ---- */
const LATE_PENALTY_TIERS = [
  { max: 10, amount: 5000 },
  { max: 20, amount: 10000 },
  { max: 40, amount: 25000 },
  { max: Infinity, amount: 50000 },
];

/** ---- Helpers ---- */
function computeLatePenalty(minutes) {
  for (const t of LATE_PENALTY_TIERS) if (minutes <= t.max) return t.amount;
  return 0;
}

// 'cuti' detector when requests.type is 'time_off' or similar
function isCutiByReason(reason) {
  if (!reason) return false;
  const r = String(reason).toLowerCase();
  return r.includes("cuti") || r.includes("leave");
}

// Accept DATE/DATETIME as string or Date; return 'YYYY-MM-DD' or null
function toDateOnlyString(val) {
  if (!val) return null;
  if (val instanceof Date) {
    // create local YYYY-MM-DD, not UTC
    const pad = (n) => String(n).padStart(2, "0");
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(
      val.getDate()
    )}`;
  }
  if (typeof val === "string") {
    const m = val.match(/^\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
    const d = new Date(val.replace(" ", "T"));
    if (isNaN(d)) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const d = new Date(val);
  if (isNaN(d)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Accept DATETIME as string or Date; return Date or null
function toJSDateTime(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val.replace(" ", "T"));
    return isNaN(d) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

// Make Date from 'YYYY-MM-DD' + 'HH:MM:SS'
function makeDateTimeFromDateAndTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}`);
  return isNaN(d) ? null : d;
}

/** Detect OFF category based on your tables (IDs, names, times) */
function isOffCategory({ cat_id, cat_name, time_start, time_end }) {
  const id = String(cat_id || "").toLowerCase();
  const name = String(cat_name || "").toLowerCase();

  const OFF_IDS = new Set([
    "cat-holiday",
    "cat-time_off",
    "cat-manual",
    "dayoff",
  ]);
  if (OFF_IDS.has(id)) return true;

  if (
    /(^|\s)(holiday|day\s*off|time\s*off|off|libur|manual\s+attendance)(\s|$)/i.test(
      name
    )
  ) {
    return true;
  }

  if (
    (time_start === "00:00:00" || !time_start) &&
    (time_end === "23:59:00" || time_end === "23:59:59")
  ) {
    return true;
  }

  return false;
}

/** Build period from YM or explicit range (local time, not UTC) */
function buildPeriod({ year, month, fromDate, toDate }) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (fromDate && toDate) {
    const a = new Date(fromDate + "T00:00:00");
    const b = new Date(toDate + "T00:00:00");
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;
    const startDate = fmtDate(start);
    const endDate = fmtDate(end);
    return {
      mode: "range",
      startDate,
      endDate,
      startDT: `${startDate} 00:00:00`,
      endDT: `${endDate} 23:59:59`,
    };
  }

  // local month boundaries
  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59);
  const startDate = fmtDate(start);
  const endDate = fmtDate(end);
  return {
    mode: "month",
    startDate,
    endDate,
    startDT: `${startDate} 00:00:00`,
    endDT: `${endDate} 23:59:59`,
  };
}

class PresenceSummaryService {
  constructor() {
    this._db = database.getConnection();
  }

  /** Summary for month or range; group='user' or 'day' */
  async getSummary({
    year,
    month,
    fromDate,
    toDate,
    group = "user",
    sortBy,
    sortDir = "asc",
  }) {
    const period = buildPeriod({ year, month, fromDate, toDate });
    const { startDate, endDate, startDT, endDT } = period;

    // Schedules with category
    const [schedules] = await this._db.query(
      `SELECT us.user_id, us.date,
              sc.id AS cat_id, sc.name AS cat_name,
              sc.time_start, sc.time_end
       FROM user_schedules us
       JOIN schedule_categories sc ON sc.id = us.category_id
       JOIN users u ON u.id = us.user_id AND u.is_active = 1
       WHERE us.date BETWEEN ? AND ?`,
      [startDate, endDate]
    );

    // First check-in (with attendance_susulan)
    const [checkins] = await this._db.query(
      `SELECT user_id, d, MIN(first_checkin) AS first_checkin
       FROM (
         SELECT a.user_id AS user_id, DATE(a.recorded_at) AS d, a.recorded_at AS first_checkin
         FROM attendances a
         JOIN users u ON u.id = a.user_id AND u.is_active = 1
         WHERE a.type='checkin' AND a.recorded_at BETWEEN ? AND ?
         UNION ALL
         SELECT s.user_id,
                s.attendance_date AS d,
                STR_TO_DATE(CONCAT(s.attendance_date,' ', s.checkin_time), '%Y-%m-%d %H:%i:%s') AS first_checkin
         FROM attendance_susulan s
         JOIN users u2 ON u2.id = s.user_id AND u2.is_active = 1
         WHERE s.type='checkin'
           AND s.status='approved'
           AND s.attendance_date BETWEEN ? AND ?
           AND s.checkin_time IS NOT NULL
       ) t
       GROUP BY user_id, d`,
      [startDT, endDT, startDate, endDate]
    );

    // Last checkout (with attendance_susulan)
    const [checkouts] = await this._db.query(
      `SELECT user_id, d, MAX(last_checkout) AS last_checkout
       FROM (
         SELECT a.user_id AS user_id, DATE(a.recorded_at) AS d, a.recorded_at AS last_checkout
         FROM attendances a
         JOIN users u ON u.id = a.user_id AND u.is_active = 1
         WHERE a.type='checkout' AND a.recorded_at BETWEEN ? AND ?
         UNION ALL
         SELECT s.user_id,
                s.attendance_date AS d,
                STR_TO_DATE(CONCAT(s.attendance_date,' ', s.checkout_time), '%Y-%m-%d %H:%i:%s') AS last_checkout
         FROM attendance_susulan s
         JOIN users u2 ON u2.id = s.user_id AND u2.is_active = 1
         WHERE s.type='checkout'
           AND s.status='approved'
           AND s.attendance_date BETWEEN ? AND ?
           AND s.checkout_time IS NOT NULL
       ) t
       GROUP BY user_id, d`,
      [startDT, endDT, startDate, endDate]
    );

    // Names & tolerances
    const [tolerances] = await this._db.query(
      `SELECT u.id AS user_id, u.fullname, COALESCE(lt.minutes,0) AS tol_minutes
       FROM users u
       LEFT JOIN late_tolerances lt ON lt.id = u.late_tolerance_id
       WHERE u.is_active = 1`
    );

    // Approved requests (normalize to start_date/end_date)
    const [requests] = await this._db.query(
      `SELECT r.id, r.user_id, r.type, r.reason, r.status,
              r.request_date                                       AS start_date,
              COALESCE(r.request_end_date, r.request_date)         AS end_date
       FROM requests r
       JOIN users u ON u.id = r.user_id AND u.is_active = 1
       WHERE r.status='approved' AND (
         (r.request_date BETWEEN ? AND ?) OR
         (COALESCE(r.request_end_date, r.request_date) BETWEEN ? AND ?) OR
         (r.request_date <= ? AND COALESCE(r.request_end_date, r.request_date) >= ?)
       )`,
      [startDate, endDate, startDate, endDate, startDate, endDate]
    );

    // Indexes
    const tolByUser = new Map();
    const nameByUser = new Map();
    tolerances.forEach((r) => {
      tolByUser.set(r.user_id, Number(r.tol_minutes || 0));
      nameByUser.set(r.user_id, r.fullname);
    });

    const firstCheckinMap = new Map();
    checkins.forEach((c) => {
      const dStr = toDateOnlyString(c.d);
      const dt = toJSDateTime(c.first_checkin);
      if (dStr && dt) firstCheckinMap.set(`${c.user_id}|${dStr}`, dt);
    });

    const lastCheckoutMap = new Map();
    checkouts.forEach((c) => {
      const dStr = toDateOnlyString(c.d);
      const dt = toJSDateTime(c.last_checkout);
      if (dStr && dt) lastCheckoutMap.set(`${c.user_id}|${dStr}`, dt);
    });

    // Expand requests → per-user per-day excuses
    const excused = new Map(); // uid -> Map(ds -> { any, izin, cuti, sick })
    const addExcuse = (uid, ds, patch) => {
      if (!excused.has(uid)) excused.set(uid, new Map());
      const prev = excused.get(uid).get(ds) || {
        any: false,
        izin: false,
        cuti: false,
        sick: false,
      };
      excused.get(uid).set(ds, { ...prev, ...patch, any: true });
    };

    for (const r of requests) {
      let patch = { any: true };
      if (r.type === "sick") {
        patch = { any: true, sick: true };
      } else if (r.type === "time_off" || r.type === "manual_attendance") {
        // treat manual_attendance as izin unless reason clearly says cuti
        patch = isCutiByReason(r.reason)
          ? { any: true, cuti: true }
          : { any: true, izin: true };
      } else {
        patch = { any: true };
      }

      const start = toDateOnlyString(r.start_date);
      const end = toDateOnlyString(r.end_date);
      if (!start || !end) continue;

      let cur = new Date(`${start}T00:00:00`);
      const e = new Date(`${end}T00:00:00`);
      while (cur <= e) {
        const ds = toDateOnlyString(cur);
        if (ds >= startDate && ds <= endDate) addExcuse(r.user_id, ds, patch);
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Aggregators
    const perUser = new Map();
    const getUser = (uid) => {
      if (!perUser.has(uid))
        perUser.set(uid, {
          user_id: uid,
          fullname: nameByUser.get(uid) || uid,
          izin_days: 0,
          cuti_days: 0,
          sakit_days: 0,
          late_count: 0,
          late_minutes_total: 0,
          late_nominal_total: 0,
          early_count: 0,
          early_minutes_total: 0,
          early_nominal_total: 0,
          alfa_days: 0,
          excused_days: 0,
          excused_dates: [],
          izin_dates: [],
          cuti_dates: [],
          sakit_dates: [],
          alfa_dates: [],
          late_days: [],
          early_days: [],
        });
      return perUser.get(uid);
    };

    const perDate = new Map();
    const getDay = (ds) => {
      if (!perDate.has(ds))
        perDate.set(ds, {
          date: ds,
          users_count: 0,
          izin_days: 0,
          cuti_days: 0,
          sakit_days: 0,
          late_count: 0,
          late_minutes_total: 0,
          late_nominal_total: 0,
          early_count: 0,
          early_minutes_total: 0,
          early_nominal_total: 0,
          alfa_days: 0,
          users_izin: [],
          users_cuti: [],
          users_sakit: [],
          users_late: [],
          users_early: [],
          users_alfa: [],
          users_excused_any: [],
        });
      return perDate.get(ds);
    };

    // Iterate schedules
    for (const s of schedules) {
      const uid = s.user_id;
      const ds = toDateOnlyString(s.date);
      if (!ds) continue;

      const excuse = excused.get(uid)?.get(ds) || {
        any: false,
        izin: false,
        cuti: false,
        sick: false,
      };

      const U = getUser(uid);
      const D = getDay(ds);
      D.users_count += 1;

      // Always count requests first (even for OFF days)
      if (excuse.any) {
        const desc = excuse.sick
          ? "have request (sick)"
          : excuse.cuti
          ? "have request (cuti)"
          : excuse.izin
          ? "have request (izin)"
          : "have request";

        U.excused_days++;
        U.excused_dates.push({ date: ds, desc });
        D.users_excused_any.push({ user_id: uid, fullname: U.fullname, desc });

        if (excuse.izin) {
          U.izin_days++;
          U.izin_dates.push(ds);
          D.izin_days++;
          D.users_izin.push({ user_id: uid, fullname: U.fullname, desc });
        }
        if (excuse.cuti) {
          U.cuti_days++;
          U.cuti_dates.push(ds);
          D.cuti_days++;
          D.users_cuti.push({ user_id: uid, fullname: U.fullname, desc });
        }
        if (excuse.sick) {
          U.sakit_days++;
          U.sakit_dates.push(ds);
          D.sakit_days++;
          D.users_sakit.push({ user_id: uid, fullname: U.fullname, desc });
        }
        // after counting requests, if the day is OFF, stop here
        const offDayAfterExcuse = isOffCategory({
          cat_id: s.cat_id,
          cat_name: s.cat_name,
          time_start: s.time_start,
          time_end: s.time_end,
        });
        if (offDayAfterExcuse) continue;
      } else {
        // no request → if OFF day, skip (no alfa/late/early)
        const offDay = isOffCategory({
          cat_id: s.cat_id,
          cat_name: s.cat_name,
          time_start: s.time_start,
          time_end: s.time_end,
        });
        if (offDay) continue;
      }

      // From here: non-OFF day without requests → attendance logic

      const fc = firstCheckinMap.get(`${uid}|${ds}`);
      if (!fc) {
        U.alfa_days++;
        U.alfa_dates.push(ds);
        D.alfa_days++;
        D.users_alfa.push({ user_id: uid, fullname: U.fullname });
        continue;
      }

      // LATE CHECK-IN
      if (s.time_start) {
        const tol = tolByUser.get(uid) || 0;
        const sched = makeDateTimeFromDateAndTime(ds, s.time_start);
        if (sched) {
          const schedTol = new Date(sched.getTime() + tol * 60000);
          const diffMs = fc.getTime() - schedTol.getTime();
          if (diffMs > 0) {
            const lateMin = Math.ceil(diffMs / 60000);
            const nominal = computeLatePenalty(lateMin);

            U.late_count++;
            U.late_minutes_total += lateMin;
            U.late_nominal_total += nominal;
            U.late_days.push({
              date: ds,
              minutes: lateMin,
              nominal,
              first_checkin: fc.toISOString().slice(11, 19),
              scheduled_start: s.time_start,
              tolerance_min: tol,
            });

            D.late_count++;
            D.late_minutes_total += lateMin;
            D.late_nominal_total += nominal;
            D.users_late.push({
              user_id: uid,
              fullname: U.fullname,
              minutes: lateMin,
              nominal,
              first_checkin: fc.toISOString().slice(11, 19),
              scheduled_start: s.time_start,
              tolerance_min: tol,
            });
          }
        }
      }

      // EARLY CHECKOUT
      if (s.time_end) {
        const lc = lastCheckoutMap.get(`${uid}|${ds}`);
        if (lc) {
          const tol = tolByUser.get(uid) || 0;
          const schedEnd = makeDateTimeFromDateAndTime(ds, s.time_end);
          if (schedEnd) {
            const schedEndMinusTol = new Date(schedEnd.getTime() - tol * 60000);
            const diffMs = schedEndMinusTol.getTime() - lc.getTime(); // positive if early
            if (diffMs > 0) {
              const earlyMin = Math.ceil(diffMs / 60000);
              const nominal = computeLatePenalty(earlyMin);

              U.early_count++;
              U.early_minutes_total += earlyMin;
              U.early_nominal_total += nominal;
              U.early_days.push({
                date: ds,
                minutes: earlyMin,
                nominal,
                last_checkout: lc.toISOString().slice(11, 19),
                scheduled_end: s.time_end,
                tolerance_min: tol,
              });

              D.early_count++;
              D.early_minutes_total += earlyMin;
              D.early_nominal_total += nominal;
              D.users_early.push({
                user_id: uid,
                fullname: U.fullname,
                minutes: earlyMin,
                nominal,
                last_checkout: lc.toISOString().slice(11, 19),
                scheduled_end: s.time_end,
                tolerance_min: tol,
              });
            }
          }
        }
      }
    }

    // Build items (grouped) and compute deduction_total
    let items =
      group === "day"
        ? Array.from(perDate.values())
        : Array.from(perUser.values());

    for (const it of items) {
      it.deduction_total =
        asNumber(it.late_nominal_total) + asNumber(it.early_nominal_total);
    }

    // Sorting
    const defaultKey = group === "day" ? "date" : "fullname";
    const key = sortBy || defaultKey;
    sortItems(items, key, sortDir || "asc");

    // Totals
    const totals = items.reduce(
      (acc, it) => {
        if (group === "day") {
          acc.users += it.users_count;
          acc.izin_days += it.izin_days;
          acc.cuti_days += it.cuti_days;
          acc.sakit_days += it.sakit_days;
          acc.late_count += it.late_count;
          acc.late_minutes_total += it.late_minutes_total;
          acc.late_nominal_total += it.late_nominal_total;
          acc.early_count += it.early_count;
          acc.early_minutes_total += it.early_minutes_total;
          acc.early_nominal_total += it.early_nominal_total;
          acc.alfa_days += it.alfa_days;
        } else {
          acc.users += 1;
          acc.izin_days += it.izin_days;
          acc.cuti_days += it.cuti_days;
          acc.sakit_days += it.sakit_days;
          acc.late_count += it.late_count;
          acc.late_minutes_total += it.late_minutes_total;
          acc.late_nominal_total += it.late_nominal_total;
          acc.early_count += it.early_count;
          acc.early_minutes_total += it.early_minutes_total;
          acc.early_nominal_total += it.early_nominal_total;
          acc.alfa_days += it.alfa_days;
        }
        return acc;
      },
      {
        users: 0,
        izin_days: 0,
        cuti_days: 0,
        sakit_days: 0,
        late_count: 0,
        late_minutes_total: 0,
        late_nominal_total: 0,
        early_count: 0,
        early_minutes_total: 0,
        early_nominal_total: 0,
        alfa_days: 0,
      }
    );

    return {
      mode: period.mode,
      group,
      year: year ?? null,
      month: month ?? null,
      from_date: period.mode === "range" ? startDate : null,
      to_date: period.mode === "range" ? endDate : null,
      count: items.length,
      totals,
      items,
    };
  }

  /** Detail for single user (month or range) — CONTINUOUS CALENDAR */
  async getUserDetail({ userId, year, month, fromDate, toDate }) {
    const period = buildPeriod({ year, month, fromDate, toDate });
    const { startDate, endDate, startDT, endDT } = period;

    const [[userRow]] = await this._db.query(
      `SELECT u.id AS user_id, u.fullname, COALESCE(lt.minutes,0) AS tol_minutes
       FROM users u
       LEFT JOIN late_tolerances lt ON lt.id = u.late_tolerance_id
       WHERE u.id = ? AND u.is_active = 1
       LIMIT 1`,
      [userId]
    );
    if (!userRow) {
      return {
        user_id: userId,
        fullname: userId,
        mode: period.mode,
        from_date: startDate,
        to_date: endDate,
        days: [],
      };
    }

    const [schedules] = await this._db.query(
      `SELECT us.date,
              sc.id AS cat_id, sc.name AS cat_name,
              sc.time_start, sc.time_end
       FROM user_schedules us
       JOIN schedule_categories sc ON sc.id = us.category_id
       JOIN users u ON u.id = us.user_id AND u.is_active = 1
       WHERE us.user_id = ? AND us.date BETWEEN ? AND ?`,
      [userId, startDate, endDate]
    );

    // First check-in (include attendance_susulan)
    const [checkins] = await this._db.query(
      `SELECT d, MIN(first_checkin) AS first_checkin
       FROM (
         SELECT DATE(a.recorded_at) AS d, a.recorded_at AS first_checkin
         FROM attendances a
         JOIN users u ON u.id = a.user_id AND u.is_active = 1
         WHERE a.user_id = ? AND a.type='checkin' AND a.recorded_at BETWEEN ? AND ?
         UNION ALL
         SELECT s.attendance_date AS d,
                STR_TO_DATE(CONCAT(s.attendance_date,' ', s.checkin_time), '%Y-%m-%d %H:%i:%s') AS first_checkin
         FROM attendance_susulan s
         JOIN users u2 ON u2.id = s.user_id AND u2.is_active = 1
         WHERE s.user_id = ?
           AND s.type='checkin'
           AND s.status='approved'
           AND s.attendance_date BETWEEN ? AND ?
           AND s.checkin_time IS NOT NULL
       ) t
       GROUP BY d`,
      [userId, startDT, endDT, userId, startDate, endDate]
    );

    // Last checkout (include attendance_susulan)
    const [checkouts] = await this._db.query(
      `SELECT d, MAX(last_checkout) AS last_checkout
       FROM (
         SELECT DATE(a.recorded_at) AS d, a.recorded_at AS last_checkout
         FROM attendances a
         JOIN users u ON u.id = a.user_id AND u.is_active = 1
         WHERE a.user_id = ? AND a.type='checkout' AND a.recorded_at BETWEEN ? AND ?
         UNION ALL
         SELECT s.attendance_date AS d,
                STR_TO_DATE(CONCAT(s.attendance_date,' ', s.checkout_time), '%Y-%m-%d %H:%i:%s') AS last_checkout
         FROM attendance_susulan s
         JOIN users u2 ON u2.id = s.user_id AND u2.is_active = 1
         WHERE s.user_id = ?
           AND s.type='checkout'
           AND s.status='approved'
           AND s.attendance_date BETWEEN ? AND ?
           AND s.checkout_time IS NOT NULL
       ) t
       GROUP BY d`,
      [userId, startDT, endDT, userId, startDate, endDate]
    );

    const fcMap = new Map(
      checkins.map((r) => [
        toDateOnlyString(r.d),
        toJSDateTime(r.first_checkin),
      ])
    );
    const lcMap = new Map(
      checkouts.map((r) => [
        toDateOnlyString(r.d),
        toJSDateTime(r.last_checkout),
      ])
    );

    // Requests for the user (normalize dates)
    const [requests] = await this._db.query(
      `SELECT r.type, r.reason,
              r.request_date                                       AS start_date,
              COALESCE(r.request_end_date, r.request_date)         AS end_date
       FROM requests r
       JOIN users u ON u.id = r.user_id AND u.is_active = 1
       WHERE r.user_id = ?
         AND r.status = 'approved'
         AND (
           (r.request_date BETWEEN ? AND ?) OR
           (COALESCE(r.request_end_date, r.request_date) BETWEEN ? AND ?) OR
           (r.request_date <= ? AND COALESCE(r.request_end_date, r.request_date) >= ?)
         )`,
      [userId, startDate, endDate, startDate, endDate, startDate, endDate]
    );

    // Map of date -> excuse flags
    const excused = new Map(); // ds -> { any, izin, cuti, sick }
    const mark = (ds, patch) => {
      const prev = excused.get(ds) || {
        any: false,
        izin: false,
        cuti: false,
        sick: false,
      };
      excused.set(ds, { ...prev, ...patch, any: true });
    };

    for (const r of requests) {
      let patch = { any: true };
      if (r.type === "sick") {
        patch = { any: true, sick: true };
      } else if (r.type === "time_off" || r.type === "manual_attendance") {
        patch = isCutiByReason(r.reason)
          ? { any: true, cuti: true }
          : { any: true, izin: true };
      } else {
        patch = { any: true };
      }

      const start = toDateOnlyString(r.start_date);
      const end = toDateOnlyString(r.end_date);
      if (!start || !end) continue;

      let cur = new Date(`${start}T00:00:00`);
      const e = new Date(`${end}T00:00:00`);
      while (cur <= e) {
        const ds = toDateOnlyString(cur);
        if (ds >= startDate && ds <= endDate) mark(ds, patch);
        cur.setDate(cur.getDate() + 1);
      }
    }

    const tol = Number(userRow.tol_minutes || 0);
    const days = [];
    let totals = {
      izin: 0,
      cuti: 0,
      sick: 0,
      late_count: 0,
      late_minutes: 0,
      late_nominal: 0,
      early_count: 0,
      early_minutes: 0,
      early_nominal: 0,
      alfa: 0,
    };

    const schedByDate = new Map(
      schedules.map((s) => [toDateOnlyString(s.date), s])
    );

    // Continuous loop from startDate..endDate
    let cur = new Date(`${startDate}T00:00:00`);
    const endD = new Date(`${endDate}T00:00:00`);

    while (cur <= endD) {
      const ds = toDateOnlyString(cur);
      const s = schedByDate.get(ds) || {
        cat_id: null,
        cat_name: null,
        time_start: null,
        time_end: null,
      };

      const offDay =
        s.cat_id != null &&
        isOffCategory({
          cat_id: s.cat_id,
          cat_name: s.cat_name,
          time_start: s.time_start,
          time_end: s.time_end,
        });

      const ex = excused.get(ds) || {
        any: false,
        izin: false,
        cuti: false,
        sick: false,
      };
      const fc = fcMap.get(ds);
      const lc = lcMap.get(ds);

      const excusedDesc = ex.sick
        ? "have request (sick)"
        : ex.cuti
        ? "have request (cuti)"
        : ex.izin
        ? "have request (izin)"
        : "have request";

      const row = {
        date: ds,
        category_id: s.cat_id,
        category_name:
          s.cat_name || (schedByDate.has(ds) ? "—" : "No schedule"),
        time_start: s.time_start,
        time_end: s.time_end,
        off_day: !!s.cat_id && offDay,
        excuse: ex,
        first_checkin: fc ? fc.toISOString().slice(11, 19) : null,
        last_checkout: lc ? lc.toISOString().slice(11, 19) : null,
        late_minutes: 0,
        late_nominal: 0,
        early_minutes: 0,
        early_nominal: 0,
        status: null,
        desc: null,
      };

      if (!schedByDate.has(ds)) {
        row.status = "no_schedule";
        row.desc = "no schedule";
        days.push(row);
        cur.setDate(cur.getDate() + 1);
        continue;
      }

      // Count requests BEFORE short-circuiting OFF days
      if (ex.any) {
        if (ex.sick) {
          row.status = "sick";
          totals.sick++;
        } else if (ex.cuti) {
          row.status = "cuti";
          totals.cuti++;
        } else if (ex.izin) {
          row.status = "izin";
          totals.izin++;
        } else {
          row.status = "excused";
        }
        row.desc = excusedDesc;
        days.push(row);
        cur.setDate(cur.getDate() + 1);
        continue;
      }

      // No request → if OFF, skip (no alfa/late/early on OFF)
      if (offDay) {
        row.status = "off";
        days.push(row);
        cur.setDate(cur.getDate() + 1);
        continue;
      }

      if (!fc) {
        row.status = "alfa";
        totals.alfa++;
        days.push(row);
        cur.setDate(cur.getDate() + 1);
        continue;
      }

      // LATE CHECK-IN
      if (s.time_start) {
        const sched = makeDateTimeFromDateAndTime(ds, s.time_start);
        if (sched) {
          const schedTol = new Date(sched.getTime() + tol * 60000);
          const diff = fc.getTime() - schedTol.getTime();
          if (diff > 0) {
            const lateMin = Math.ceil(diff / 60000);
            row.late_minutes = lateMin;
            row.late_nominal = computeLatePenalty(lateMin);
            row.status = "late";
            totals.late_count++;
            totals.late_minutes += lateMin;
            totals.late_nominal += row.late_nominal;
          } else {
            row.status = "ontime";
          }
        } else {
          row.status = "ontime";
        }
      } else {
        row.status = "ontime";
      }

      // EARLY CHECKOUT
      if (s.time_end && lc) {
        const schedEnd = makeDateTimeFromDateAndTime(ds, s.time_end);
        if (schedEnd) {
          const schedEndMinusTol = new Date(schedEnd.getTime() - tol * 60000);
          const diffMs = schedEndMinusTol.getTime() - lc.getTime(); // positive → early
          if (diffMs > 0) {
            const earlyMin = Math.ceil(diffMs / 60000);
            const nominal = computeLatePenalty(earlyMin);
            row.early_minutes = earlyMin;
            row.early_nominal = nominal;
            row.status = row.status === "late" ? "late+early" : "early";
            totals.early_count++;
            totals.early_minutes += earlyMin;
            totals.early_nominal += nominal;
          }
        }
      }

      days.push(row);
      cur.setDate(cur.getDate() + 1);
    }

    return {
      user_id: userRow.user_id,
      fullname: userRow.fullname,
      mode: period.mode,
      year: year ?? null,
      month: month ?? null,
      from_date: period.mode === "range" ? startDate : null,
      to_date: period.mode === "range" ? endDate : null,
      totals,
      days,
    };
  }
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sortItems(items, key, dir) {
  const mul = dir === "desc" ? -1 : 1;
  return items.sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];

    // numeric compare if either looks numeric
    const aNum = typeof av === "number" || (av != null && !isNaN(Number(av)));
    const bNum = typeof bv === "number" || (bv != null && !isNaN(Number(bv)));
    if (aNum || bNum) {
      return (asNumber(av) - asNumber(bv)) * mul;
    }
    // string compare fallback
    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
}

module.exports = PresenceSummaryService;
