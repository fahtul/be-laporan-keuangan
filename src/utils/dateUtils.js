// utils/date-util.js
const moment = require("moment-timezone");

class DateUtil {
  /**
   * @param {string} tz Default zona waktu lokal bisnis. Contoh: 'Asia/Makassar'
   */
  constructor(tz = "Asia/Makassar") {
    this.tz = tz;
  }

  /** Waktu sekarang di zona bisnis, format 'YYYY-MM-DD HH:mm:ss' */
  nowInZone() {
    return moment().tz(this.tz).format("YYYY-MM-DD HH:mm:ss");
  }

  /** Zero-pad 2 digit */
  pad2(n) {
    return String(n).padStart(2, "0");
  }

  /**
   * Format tanggal ke 'YYYY-MM-DD'
   * - useUTC = true → baca Date sebagai UTC
   * - useUTC = false → render di zona bisnis (Asia/Makassar)
   */
  toYMD(date, useUTC = true) {
    return useUTC
      ? moment.utc(date).format("YYYY-MM-DD")
      : moment(date).tz(this.tz).format("YYYY-MM-DD");
  }

  /**
   * Payroll bulan M: 26 (M-1) s.d. 25 (M), inklusif — berbasis kalender zona bisnis.
   * @param {number} year  - 4 digit, mis. 2025
   * @param {number} month - 1..12
   * @returns { start, end, startStr, endStr, startUtcISO, endUtcISO }
   */
  getPayrollPeriod(year, month) {
    // Hitung di zona bisnis biar “tanggal” mengikuti kalender lokal.
    const end = moment
      .tz({ year, month: month - 1, day: 25 }, this.tz)
      .startOf("day");
    const start = end.clone().subtract(1, "month").date(26).startOf("day");

    return {
      start: start.toDate(), // JS Date (instan absolut)
      end: end.toDate(),
      startStr: start.format("YYYY-MM-DD"), // tanggal lokal
      endStr: end.format("YYYY-MM-DD"),
      startUtcISO: start.toDate().toISOString(),
      endUtcISO: end.toDate().toISOString(),
    };
  }

  /**
   * Generator tanggal harian 'YYYY-MM-DD' (inklusif), mengikuti kalender zona bisnis.
   * Bisa dipakai untuk loop payroll 26…25
   */
  *eachDateYMD(startStr, endStr) {
    let cur = moment.tz(startStr, "YYYY-MM-DD", this.tz).startOf("day");
    const end = moment.tz(endStr, "YYYY-MM-DD", this.tz).startOf("day");
    while (!cur.isAfter(end, "day")) {
      yield cur.format("YYYY-MM-DD");
      cur = cur.add(1, "day");
    }
  }

  /**
   * Parse 'YYYY-MM-DD HH:mm:ss' sebagai waktu lokal (Asia/Makassar) → JS Date (UTC-equivalent)
   * Gunakan ini untuk membangun scheduledIn/Out dari jadwal harian.
   */
  parseInZone(dateStr, timeStr) {
    return moment
      .tz(`${dateStr} ${timeStr}`, "YYYY-MM-DD HH:mm:ss", this.tz)
      .toDate();
  }

  /**
   * Konversi Date/ISO ke menit (helper beda menit).
   * Pastikan dua-duanya dalam baseline yang sama (JS Date → UTC by design).
   */
  diffMinutes(later, earlier) {
    return Math.round((later - earlier) / 60000);
  }
}

module.exports = { DateUtil };
