// src/services/mssql/RequestsService.js
const { nanoid } = require("nanoid"); // Anda tetap bisa memakai nanoid untuk hal lain jika perlu
const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");
const database = require("../../database");

const ROLE_UNIT_LEADER = 3; // dari sistemmu
const ROLE_DIVISION_LEADER = 2; // sesuaikan kalau beda

const LEVEL_LABELS = {
  1: "Pengawas",
  2: "Operasional",
};

class RequestsService {
  constructor() {
    this._db = database.getConnection();
  }

  async getRequestById(requestId) {
    const [rows] = await this._db.execute(
      `SELECT id, user_id, status, evidence_photo
       FROM requests
       WHERE id = ?`,
      [requestId]
    );
    if (!rows.length) throw new NotFoundError("Request not found");
    return rows[0];
  }

  _parseEvidenceNames(evidence) {
    if (!evidence) return [];
    if (Array.isArray(evidence)) return evidence.filter(Boolean);

    // try JSON first
    try {
      const parsed = JSON.parse(evidence);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_) {
      // ignore
    }

    // fallback: comma separated string
    if (typeof evidence === "string") {
      return evidence
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  // --- NEW: delete one request (no file delete here; return names for handler)
  async deleteRequest(requestId, requesterUserId) {
    // 1) load row
    const row = await this.getRequestById(requestId);

    // 2) only owner can delete and only if pending
    if (String(row.user_id) !== String(requesterUserId)) {
      throw new InvariantError("Anda tidak berhak menghapus request ini.");
    }
    if (row.status !== "pending") {
      throw new InvariantError(
        "Hanya request berstatus pending yang bisa dihapus."
      );
    }

    // 3) cleanup related approvals (if table exists)
    try {
      await this._db.execute(
        `DELETE FROM request_approvals WHERE request_id = ?`,
        [requestId]
      );
    } catch (err) {
      // If the table doesn't exist, ignore. Otherwise rethrow.
      if (err && err.code !== "ER_NO_SUCH_TABLE") {
        throw err;
      }
    }

    // 4) delete the request
    const [res] = await this._db.execute(`DELETE FROM requests WHERE id = ?`, [
      requestId,
    ]);
    if (res.affectedRows === 0) {
      throw new InvariantError("Gagal menghapus request.");
    }

    // 5) return filenames so caller can delete files on disk
    const evidenceNames = this._parseEvidenceNames(row.evidence_photo);
    return { deletedId: requestId, evidenceNames };
  }

  // Add near other methods in class RequestsService
  async updateRequestStatus(requestId, status, note = null, adminId = null) {
    const allowed = new Set(["pending", "approved", "rejected"]);
    if (!allowed.has(String(status))) {
      throw new InvariantError("Invalid status value");
    }

    // 1) Update main request row
    const [res] = await this._db.execute(
      `UPDATE requests
       SET status = ?, updated_at = NOW()
     WHERE id = ?`,
      [status, requestId]
    );
    if (res.affectedRows === 0) {
      throw new NotFoundError("Request not found");
    }

    // 2) Keep approvals consistent (admin override)
    //    - If approved/rejected: close all approvals to same status
    //    - If pending: reset all approvals to pending
    const noteSuffix = note
      ? `${note}`
      : `Admin override${adminId ? " by " + adminId : ""}`;

    if (status === "pending") {
      await this._db.execute(
        `UPDATE request_approvals
          SET status='pending',
              note=NULL,
              decided_at=NULL
        WHERE request_id=?`,
        [requestId]
      );
    } else {
      await this._db.execute(
        `UPDATE request_approvals
          SET status=?,
              note = CONCAT(COALESCE(note,''), IF(note IS NULL OR note='','', ' | '), ?),
              decided_at = NOW()
        WHERE request_id=?`,
        [status, noteSuffix, requestId]
      );
    }

    return { requestId, status };
  }

  // --- helper to build WHERE & params consistently
  _buildWhere({ search, status, type, userId, approverId, dateFrom, dateTo }) {
    const where = [];
    const params = [];

    if (userId) {
      where.push("r.user_id = ?");
      params.push(userId);
    }
    if (status && status !== "all") {
      where.push("r.status = ?");
      params.push(status);
    }
    if (type) {
      where.push("r.type = ?");
      params.push(type);
    }
    if (dateFrom) {
      // filter by request_date >= dateFrom
      where.push("r.request_date >= ?");
      params.push(dateFrom);
    }
    if (dateTo) {
      // filter by request_date <= dateTo
      where.push("r.request_date <= ?");
      params.push(dateTo);
    }
    if (approverId) {
      // include requests where this approver is in approvals
      where.push(`
        EXISTS (
          SELECT 1 FROM request_approvals raX
          WHERE raX.request_id = r.id AND raX.approver_id = ?
        )
      `);
      params.push(approverId);
    }
    if (search) {
      const like = `%${search}%`;
      where.push(`(r.reason LIKE ? OR r.type LIKE ? OR u.fullname LIKE ?)`);
      params.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return { whereSql, params };
  }

  /**
   * List ALL requests + nested approvals for admin/reporting screens.
   * Returns { rows: [...], total: number }
   */
  async listAllWithDetails({
    limit = 50,
    offset = 0,
    search,
    status, // 'pending' | 'approved' | 'rejected' | 'all'
    type, // 'overtime' | 'time_off' | ...
    userId,
    approverId, // filter by a particular approver being involved
    dateFrom, // 'YYYY-MM-DD'
    dateTo, // 'YYYY-MM-DD'
    orderBy = "r.created_at",
    orderDir = "DESC",
  } = {}) {
    // safety
    limit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    offset = Math.max(0, parseInt(offset, 10) || 0);
    const dir = String(orderDir).toUpperCase() === "ASC" ? "ASC" : "DESC";
    const orderField = [
      "r.created_at",
      "r.request_date",
      "u.fullname",
    ].includes(orderBy)
      ? orderBy
      : "r.created_at";

    const { whereSql, params } = this._buildWhere({
      search,
      status,
      type,
      userId,
      approverId,
      dateFrom,
      dateTo,
    });

    // 1) main page of requests
    const sql = `
      SELECT
        r.id,
        r.user_id,
        u.fullname              AS user_name,
        r.type,
        r.reason,
        r.request_date,
        r.request_end_date,
        r.start_time,
        r.end_time,
        r.shift_id,
        r.status                AS request_status,
        r.evidence_photo,
        r.created_at,
        r.updated_at
      FROM requests r
      JOIN users u ON u.id = r.user_id
      ${whereSql}
      ORDER BY ${orderField} ${dir}
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [rows] = await this._db.execute(sql, params);

    if (!rows.length) {
      // also compute total = 0
      return { rows: [], total: 0 };
    }

    // 2) total count (same WHERE, no LIMIT)
    const countSql = `
      SELECT COUNT(*) AS total
      FROM requests r
      JOIN users u ON u.id = r.user_id
      ${whereSql}
    `;
    const [cnt] = await this._db.execute(countSql, params);
    const total = cnt[0]?.total || 0;

    // 3) fetch approvals for all these IDs
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const [approvals] = await this._db.execute(
      `
      SELECT
        ra.request_id,
        ra.approver_id,
        ra.level,
        ra.status        AS approval_status,
        ra.note,
        ra.decided_at,
        ua.fullname      AS approver_name
      FROM request_approvals ra
      JOIN users ua ON ua.id = ra.approver_id
      WHERE ra.request_id IN (${placeholders})
      ORDER BY ra.request_id, ra.level
      `,
      ids
    );

    // group approvals by request_id
    const apprMap = new Map();
    approvals.forEach((a) => {
      if (!apprMap.has(a.request_id)) apprMap.set(a.request_id, []);
      apprMap.get(a.request_id).push({
        approver_id: a.approver_id,
        approver_name: a.approver_name,
        level: a.level,
        status: a.approval_status,
        note: a.note,
        decided_at: a.decided_at,
      });
    });

    // map rows + parse evidence photos to array
    const mapped = rows.map((r) => {
      const approvals = apprMap.get(r.id) || [];
      return {
        id: r.id,
        user_id: r.user_id,
        user_name: r.user_name,
        type: r.type,
        reason: r.reason,
        request_date: r.request_date,
        request_end_date: r.request_end_date,
        start_time: r.start_time,
        end_time: r.end_time,
        shift_id: r.shift_id,
        status: r.request_status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        evidence_photos: (r.evidence_photo || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        approvals,
        progress_persetujuan: this._buildApprovalProgress(
          approvals.map((a) => ({
            // samakan shape dengan di getRequestWithDetails
            request_id: r.id,
            approver_id: a.approver_id,
            approver_name: a.approver_name,
            level: a.level,
            approval_status: a.status,
            note: a.note,
            decided_at: a.decided_at,
          }))
        ),
      };
    });

    return { rows: mapped, total };
  }

  /**
   * Single request + all approvals (detail view)
   */
  async getRequestWithDetails(requestId) {
    const [rows] = await this._db.execute(
      `
      SELECT
        r.*,
        u.fullname AS user_name
      FROM requests r
      JOIN users u ON u.id = r.user_id
      WHERE r.id = ?
    `,
      [requestId]
    );
    if (!rows.length) throw new NotFoundError("Request tidak ditemukan");
    const r = rows[0];

    const [appr] = await this._db.execute(
      `
      SELECT
        ra.request_id,
        ra.approver_id,
        ra.level,
        ra.status   AS approval_status,
        ra.note,
        ra.decided_at,
        ua.fullname AS approver_name
      FROM request_approvals ra
      JOIN users ua ON ua.id = ra.approver_id
      WHERE ra.request_id = ?
      ORDER BY ra.level, ra.decided_at
    `,
      [requestId]
    );

    const progress_persetujuan = this._buildApprovalProgress(appr);

    return {
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      type: r.type,
      reason: r.reason,
      request_date: r.request_date,
      request_end_date: r.request_end_date,
      start_time: r.start_time,
      end_time: r.end_time,
      shift_id: r.shift_id,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      evidence_photos: (r.evidence_photo || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),

      // detail per approver (kalau front-end masih butuh)
      approvals: appr.map((a) => ({
        approver_id: a.approver_id,
        approver_name: a.approver_name,
        level: a.level,
        status: a.approval_status,
        note: a.note,
        decided_at: a.decided_at,
      })),

      // 🔥 progress per level: "Pengawas", "Operasional"
      progress_persetujuan,
    };
  }

  /**
   * 1) Menyimpan row di tabel `requests` (id akan auto‐increment)
   * 2) Menambahkan row‐row di `request_approvals` sesuai array approverIds.
   *
   * Data yang diterima:
   *  {
   *    userId,
   *    type, reason, request_date, start_time, end_time, shift_id,
   *    approverIds: [array of user IDs]
   *  }
   */
  async createRequest(data) {
    const {
      userId,
      type,
      reason = null,
      request_date,
      request_end_date = null,
      start_time = null,
      end_time = null,
      shift_id = null,
      evidence_photos = [],
    } = data;

    console.log("➡️ [createRequest] Called with:", {
      userId,
      type,
      reason,
      request_date,
      request_end_date,
      start_time,
      end_time,
      shift_id,
      evidence_photos,
    });

    const photosField = evidence_photos.join(",");
    console.log("📁 [createRequest] photosField:", photosField);

    const insertQuery = `
    INSERT INTO requests
      (user_id, type, reason,
       request_date, request_end_date,
       start_time, end_time, shift_id,
       evidence_photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const values = [
      userId,
      type,
      reason,
      request_date,
      request_end_date,
      start_time,
      end_time,
      shift_id,
      photosField,
    ];

    const [result] = await this._db.execute(insertQuery, values);
    console.log("🧾 [createRequest] Raw insert result:", result);

    if (result.affectedRows !== 1) {
      console.error("❌ [createRequest] affectedRows !== 1");
      throw new InvariantError("Gagal membuat permintaan");
    }

    const requestId = result.insertId;
    console.log(
      `✅ [createRequest] New request inserted. id=${requestId}, type=${type}`
    );

    // ==============================
    //  Ambil semua approver otomatis
    // ==============================
    const approvers = await this._getApproversForUser(userId);

    if (!approvers.length) {
      console.warn(
        `⚠️ [createRequest] Tidak ditemukan unit/division leader untuk userId=${userId}`
      );
      return requestId;
    }

    // ==== Penentuan LEVEL tergantung type ====
    if (type === "time_off") {
      // 👉 Multi-approval: beda level (unit vs division)
      for (const { approverId, roleId } of approvers) {
        const level = roleId === ROLE_UNIT_LEADER ? 1 : 2; // 1 = unit, 2 = division
        console.log(
          `🧾 [createRequest] Inserting TIME_OFF approval approverId=${approverId}, level=${level}`
        );
        await this._db.execute(
          `INSERT INTO request_approvals (request_id, approver_id, level)
         VALUES (?, ?, ?)`,
          [requestId, approverId, level]
        );
      }
    } else {
      // 👉 Tipe lain (sick, overtime, dll): semua 1 level saja
      for (const { approverId } of approvers) {
        console.log(
          `🧾 [createRequest] Inserting NON-TIME_OFF approval approverId=${approverId}, level=1`
        );
        await this._db.execute(
          `INSERT INTO request_approvals (request_id, approver_id, level)
         VALUES (?, ?, 1)`,
          [requestId, approverId]
        );
      }
    }

    return requestId;
  }

  // Di dalam class RequestService (atau service yg sama)
  async _getApproversForUser(userId) {
    // 1) Ambil unit & division si pemohon
    const [userRows] = await this._db.execute(
      `SELECT unit_id, division_id FROM users WHERE id = ?`,
      [userId]
    );

    if (!userRows.length) {
      throw new NotFoundError("User pemohon tidak ditemukan");
    }

    const { unit_id, division_id } = userRows[0];

    // 2) Ambil semua unit_leader & division_leader di unit/division yang sama
    const [leaderRows] = await this._db.execute(
      `
      SELECT id, role_id, unit_id, division_id
      FROM users
      WHERE id <> ?
        AND (
          (role_id = ? AND unit_id = ?)
          OR
          (role_id = ? AND division_id = ?)
        )
    `,
      [userId, ROLE_UNIT_LEADER, unit_id, ROLE_DIVISION_LEADER, division_id]
    );

    // ⬅️ sekarang balikkan roleId, biar penentuan level di createRequest
    return leaderRows.map((row) => ({
      approverId: row.id,
      roleId: row.role_id,
    }));
  }

  _buildApprovalProgress(apprRows) {
    // apprRows: hasil join request_approvals + users utk 1 request_id

    const map = new Map();
    for (const a of apprRows) {
      if (!map.has(a.level)) map.set(a.level, []);
      map.get(a.level).push(a);
    }

    const progress = [];

    for (const [level, rows] of map.entries()) {
      // Tentukan status level:
      // - Kalau ada rejected → level = rejected
      // - else kalau ada approved → level = approved
      // - else → pending
      let decidedRow = rows.find((r) => r.approval_status === "rejected");
      let status;

      if (decidedRow) {
        status = "rejected";
      } else {
        decidedRow = rows.find((r) => r.approval_status === "approved");
        if (decidedRow) {
          status = "approved";
        } else {
          status = "pending";
        }
      }

      progress.push({
        level,
        label: LEVEL_LABELS[level] || `Level ${level}`,
        status, // 'pending' | 'approved' | 'rejected'
        decided_by: decidedRow
          ? {
              id: decidedRow.approver_id,
              name: decidedRow.approver_name,
            }
          : null,
        note: decidedRow?.note || null,
        decided_at: decidedRow?.decided_at || null,
      });
    }

    // urutkan level 1, 2, ...
    progress.sort((a, b) => a.level - b.level);
    return progress;
  }

  /**
   * Ambil daftar request (milik sendiri dan tugas approval),
   * sekaligus mengambil "next approver" fullname.
   */
  /**
   * Ambil daftar request (My Requests + paging), beserta:
   * - approver level 1 (id, name, status)
   * - approver level 2 (id, name, status)
   */
  async getRequests(userId, role, limit, offset, search = "") {
    limit = parseInt(limit, 10) || 20;
    offset = parseInt(offset, 10) || 0;

    let query = `
    SELECT
      r.id,
      r.user_id,
      u.fullname       AS user_name,
      r.type,
      r.reason,
      r.request_date,
      r.request_end_date,
      r.start_time,
      r.end_time,
      r.shift_id,
      r.status         AS request_status,
      r.evidence_photo,
      r.created_at     AS request_created_at,

      -- ==== SUMMARY LEVEL 1: UNIT LEADER ====
      ul.approved_count   AS unit_approved_count,
      ul.rejected_count   AS unit_rejected_count,
      ul.pending_count    AS unit_pending_count,
      CASE
        WHEN ul.rejected_count > 0 THEN 'rejected'
        WHEN ul.approved_count > 0 THEN 'approved'
        WHEN ul.pending_count IS NULL THEN NULL   -- tidak ada approver level 1
        ELSE 'pending'
      END AS unit_decision,

      -- ==== SUMMARY LEVEL 2: DIVISION LEADER ====
      dl.approved_count   AS division_approved_count,
      dl.rejected_count   AS division_rejected_count,
      dl.pending_count    AS division_pending_count,
      CASE
        WHEN dl.rejected_count > 0 THEN 'rejected'
        WHEN dl.approved_count > 0 THEN 'approved'
        WHEN dl.pending_count IS NULL THEN NULL   -- tidak ada approver level 2
        ELSE 'pending'
      END AS division_decision

    FROM requests r
    JOIN users u ON u.id = r.user_id

    -- summary approvals untuk level 1 (unit_leader)
    LEFT JOIN (
      SELECT
        ra.request_id,
        SUM(ra.status = 'approved') AS approved_count,
        SUM(ra.status = 'rejected') AS rejected_count,
        SUM(ra.status = 'pending')  AS pending_count
      FROM request_approvals ra
      WHERE ra.level = 1
      GROUP BY ra.request_id
    ) ul ON ul.request_id = r.id

    -- summary approvals untuk level 2 (division_leader)
    LEFT JOIN (
      SELECT
        ra.request_id,
        SUM(ra.status = 'approved') AS approved_count,
        SUM(ra.status = 'rejected') AS rejected_count,
        SUM(ra.status = 'pending')  AS pending_count
      FROM request_approvals ra
      WHERE ra.level = 2
      GROUP BY ra.request_id
    ) dl ON dl.request_id = r.id
  `;

    const params = [];
    const where = [];

    // 🔐 FILTER: sementara cuma request milik user itu
    // kalau nanti mau aktifkan juga yg dia approve, bisa pakai EXISTS ke request_approvals
    where.push(`r.user_id = ?`);
    params.push(userId);

    if (search) {
      where.push(`(
      r.reason   LIKE ?
      OR r.type  LIKE ?
      OR u.fullname LIKE ?
    )`);
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (where.length) {
      query += " WHERE " + where.join(" AND ");
    }

    query += `
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  async getRequestsCount(userId, role, search = "") {
    let query = `
    SELECT COUNT(DISTINCT r.id) AS count
    FROM requests r
    JOIN users u ON u.id = r.user_id
  `;
    const params = [];
    const whereClauses = [];

    // sama dengan getRequests: sementara hanya request milik user
    whereClauses.push(`r.user_id = ?`);
    params.push(userId);

    if (search) {
      whereClauses.push(`(
      r.reason   LIKE ?
      OR r.type  LIKE ?
      OR u.fullname LIKE ?
    )`);
      const likeSearch = `%${search}%`;
      params.push(likeSearch, likeSearch, likeSearch);
    }

    if (whereClauses.length) {
      query += " WHERE " + whereClauses.join(" AND ");
    }

    console.log(
      "Executing query getRequestsCount:",
      query,
      "with params:",
      params
    );
    const [rows] = await this._db.execute(query, params);
    return rows[0].count;
  }

  /**
   * Mendapatkan detail satu request berdasarkan ID
   */
  async getRequestDetail(requestId) {
    const [rows] = await this._db.execute(
      `SELECT * FROM requests WHERE id = ?`,
      [requestId]
    );
    if (!rows.length) {
      throw new NotFoundError("Request tidak ditemukan");
    }
    return rows[0];
  }

  /**
   * Meng‐update status approval untuk satu baris di request_approvals
   * Kemudian: jika semua approver telah memutuskan, finalize r.status di tabel requests
   */
  async updateApproval({ requestId, approverId, status, note }) {
    // 1) Update the single approval row
    const [result] = await this._db.execute(
      `
      UPDATE request_approvals
      SET status = ?, note = ?, decided_at = NOW()
      WHERE request_id = ? AND approver_id = ?
    `,
      [status, note, requestId, approverId]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError(
        "Anda tidak berhak menyetujui atau data approval tidak ditemukan"
      );
    }

    // 2) Ambil type request dulu
    const [reqRows] = await this._db.execute(
      `SELECT type FROM requests WHERE id = ?`,
      [requestId]
    );
    if (!reqRows.length) {
      throw new NotFoundError("Request tidak ditemukan");
    }

    const { type } = reqRows[0];

    // 3) Untuk selain "time_off" → langsung pakai status dari approver
    if (type !== "time_off") {
      await this._db.execute(`UPDATE requests SET status = ? WHERE id = ?`, [
        status,
        requestId,
      ]);
      return;
    }

    // ==============================
    //  KHUSUS type = "time_off"
    //  Multi-approval: 1 unit_leader & 1 division_leader cukup
    // ==============================

    // Ambil rekap status per level (1 = unit, 2 = division)
    const [groups] = await this._db.execute(
      `
      SELECT 
        level,
        SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
        COUNT(*) AS total_count
      FROM request_approvals
      WHERE request_id = ?
      GROUP BY level
    `,
      [requestId]
    );

    // Bentuk keputusan per level: 'pending' | 'approved' | 'rejected'
    const levelDecisions = {}; // { 1: 'approved', 2: 'pending', ... }

    for (const row of groups) {
      let decision = "pending";

      if (row.rejected_count > 0) {
        // Kalau ada yang reject di level ini → level dianggap rejected
        decision = "rejected";
      } else if (row.approved_count > 0) {
        // Tidak ada reject, tapi sudah ada minimal 1 approve → level approved
        decision = "approved";
      } else {
        // semua masih pending di level ini
        decision = "pending";
      }

      levelDecisions[row.level] = decision;
    }

    // Tentukan level mana saja yang memang ada (misalnya, ada unit_leader tapi tidak ada division_leader)
    const existingLevels = Object.keys(levelDecisions); // contoh: ["1", "2"]

    // Kalau tidak ada level sama sekali, biarkan tetap pending saja (kasus aneh)
    if (existingLevels.length === 0) {
      await this._db.execute(
        `UPDATE requests SET status = 'pending' WHERE id = ?`,
        [requestId]
      );
      return;
    }

    // ===== GATING LOGIC =====
    // Kita hanya finalize kalau SETIAP level yang ada SUDAH punya keputusan (bukan pending)
    const anyPendingLevel = Object.values(levelDecisions).some(
      (d) => d === "pending"
    );

    if (anyPendingLevel) {
      // Masih ada level (misal division_leader) yang belum ada approve/reject sama sekali
      // → request tetap pending
      await this._db.execute(
        `UPDATE requests SET status = 'pending' WHERE id = ?`,
        [requestId]
      );
      return;
    }

    // Sampai sini: semua level yang ADA sudah punya keputusan:
    // - minimal 1 unit_leader sudah approve/reject
    // - minimal 1 division_leader sudah approve/reject
    //   (kecuali kalau memang tidak ada division_leader untuk unit tsb)

    // FINAL STATUS:
    // - Kalau ada level yang 'rejected' → final = rejected
    // - Kalau semua level 'approved'   → final = approved
    let finalStatus = "approved";

    if (Object.values(levelDecisions).includes("rejected")) {
      finalStatus = "rejected";
    }

    await this._db.execute(`UPDATE requests SET status = ? WHERE id = ?`, [
      finalStatus,
      requestId,
    ]);
  }

  /**
   * Mendapatkan daftar request yang menunggu approval untuk seorang approver
   */
  async getPendingApprovals(approverId) {
    const query = `
    SELECT
      ra.id,
      ra.request_id,
      ra.level,
      ra.status         AS approval_status,
      ra.note,
      ra.decided_at,
      ra.created_at     AS approval_created_at,
      ra.updated_at     AS approval_updated_at,
      r.type,
      r.evidence_photo,
      r.reason,
      r.request_date,
      r.request_end_date, 
      r.start_time,
      r.end_time,
      r.shift_id,
      r.status         AS request_status,
      r.created_at     AS request_created_at,
      r.updated_at     AS request_updated_at,
      u.fullname       AS user_name,
      u.id             AS user_id
    FROM request_approvals ra
    JOIN requests r   ON r.id = ra.request_id
    JOIN users u      ON u.id = r.user_id
    WHERE ra.approver_id = ?
      AND ra.status = 'pending'
      AND r.status  = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM request_approvals ra2
        WHERE ra2.request_id = ra.request_id
          AND ra2.level      = ra.level
          AND ra2.status IN ('approved','rejected')
      )
    ORDER BY ra.created_at DESC
  `;

    const [rows] = await this._db.execute(query, [approverId]);
    return rows;
  }

  /**
   * Fetch all requests joined with user info
   * Returns an array of:
   * {
   *   userId,
   *   fullname,
   *   type,
   *   reason,
   *   request_date,
   *   request_end_date,
   *   start_time,
   *   end_time,
   *   shift_id,
   *   status
   * }
   */
  async exportRequestsRekap() {
    const query = `
      SELECT
        r.user_id        AS userId,
        u.fullname       AS fullname,
        r.type,
        r.reason,
        r.request_date,
        r.request_end_date,
        r.start_time,
        r.end_time,
        r.shift_id,
        r.status
      FROM requests r
      JOIN users u ON u.id = r.user_id
      ORDER BY u.fullname, r.type, r.request_date
    `;
    const [rows] = await this._db.execute(query);
    return rows;
  }
  /**
   * Fetch only requests of a given type
   * Returns rows sorted by user → date
   */
  async exportRequestsRekapByType(type) {
    const query = `
      SELECT
        r.user_id        AS userId,
        u.fullname       AS fullname,
        r.type,
        r.reason,
        r.request_date,
        r.request_end_date,
        r.start_time,
        r.end_time,
        r.shift_id,
        r.status
      FROM requests r
      JOIN users u ON u.id = r.user_id
      WHERE r.type = ?
      ORDER BY u.fullname, r.request_date
    `;
    const [rows] = await this._db.execute(query, [type]);
    return rows;
  }

  // src/services/mssql/RequestsService.js
  async exportRequestsSummary({ dateFrom, dateTo, type, status }) {
    const where = [];
    const params = [];

    // Filter by date range
    if (dateFrom) {
      where.push(`r.request_date >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push(`r.request_date <= ?`);
      params.push(dateTo);
    }

    // Filter by type (cuti, izin, sakit, dll)
    if (type) {
      where.push(`r.type = ?`);
      params.push(type);
    }

    // Filter by approval status
    if (status) {
      where.push(`r.status = ?`);
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const query = `
    SELECT
      u.fullname AS user_name,
      r.user_id,
      r.type,
      r.status,
      r.reason,
      r.request_date,
      r.request_end_date,
      DATEDIFF(IFNULL(r.request_end_date, r.request_date), r.request_date) + 1 AS total_days
    FROM requests r
    JOIN users u ON u.id = r.user_id
    ${whereSql}
    ORDER BY u.fullname, r.request_date
  `;

    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  async exportRequestsSummary({ dateFrom, dateTo, type, status }) {
    const where = [];
    const params = [];

    // Filter by date range
    if (dateFrom) {
      where.push(`DATE(r.request_date) >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push(`DATE(r.request_date) <= ?`);
      params.push(dateTo);
    }

    // Filter by type
    if (type) {
      where.push(`r.type = ?`);
      params.push(type);
    }

    // Filter by status
    if (status) {
      where.push(`r.status = ?`);
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const query = `
      SELECT
        u.fullname AS user_name,
        r.user_id,
        r.type,
        r.status,
        r.reason,
        DATE(r.request_date) AS request_date,
        DATE(r.request_end_date) AS request_end_date,
        DATEDIFF(IFNULL(r.request_end_date, r.request_date), r.request_date) + 1 AS total_days
      FROM requests r
      JOIN users u ON u.id = r.user_id
      ${whereSql}
      ORDER BY u.fullname, r.request_date
    `;

    console.log("Generated SQL:", query);
    console.log("With Params:", params);

    const [rows] = await this._db.execute(query, params);
    return rows;
  }
}

module.exports = RequestsService;
