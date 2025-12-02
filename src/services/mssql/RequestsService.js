// src/services/mssql/RequestsService.js
const { nanoid } = require("nanoid"); // Anda tetap bisa memakai nanoid untuk hal lain jika perlu
const InvariantError = require("../../exceptions/InvariantError");
const NotFoundError = require("../../exceptions/NotFoundError");
const database = require("../../database");

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
    const mapped = rows.map((r) => ({
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
      approvals: apprMap.get(r.id) || [],
    }));

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
      ORDER BY ra.level
      `,
      [requestId]
    );

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
      approvals: appr.map((a) => ({
        approver_id: a.approver_id,
        approver_name: a.approver_name,
        level: a.level,
        status: a.approval_status,
        note: a.note,
        decided_at: a.decided_at,
      })),
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
      request_end_date = null, // ← default to null
      start_time = null, // ← default to null
      end_time = null, // ← default to null
      shift_id = null, // ← default to null
      evidence_photos = [],
      approverIds = [],
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
      approverIds,
    });

    if (type === "late_attendance") {
      console.log(
        "🐛 DEBUG [createRequest] type is late_attendance (Absen Susulan)"
      );
    }

    // join filenames into a comma list
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

    console.log("🧾 [createRequest] Insert query values:", values);

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

    // insert approvals
    for (let i = 0; i < approverIds.length; i++) {
      console.log(
        `🧾 [createRequest] Inserting approval level=${i + 1} approverId=${
          approverIds[i]
        }`
      );
      await this._db.execute(
        `INSERT INTO request_approvals(request_id, approver_id, level)
       VALUES (?, ?, ?)`,
        [requestId, approverIds[i], i + 1]
      );
    }

    return requestId;
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
      ra1.approver_id  AS approver_level1_id,
      ua1.fullname     AS approver_level1_name,
      ra1.status       AS approver_level1_status,
      ra2.approver_id  AS approver_level2_id,
      ua2.fullname     AS approver_level2_name,
      ra2.status       AS approver_level2_status
    FROM requests r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN (
      SELECT request_id, approver_id, status
      FROM request_approvals
      WHERE level = 1
    ) ra1 ON ra1.request_id = r.id
    LEFT JOIN users ua1 ON ua1.id = ra1.approver_id
    LEFT JOIN (
      SELECT request_id, approver_id, status
      FROM request_approvals
      WHERE level = 2
    ) ra2 ON ra2.request_id = r.id
    LEFT JOIN users ua2 ON ua2.id = ra2.approver_id
  `;

    const params = [];
    const where = [];

    // if (role !== 4) {
    //   where.push(`(
    //   r.user_id = ?
    //   OR EXISTS (
    //     SELECT 1 FROM request_approvals rav
    //     WHERE rav.request_id = r.id AND rav.approver_id = ?
    //   )
    // )`);
    //   params.push(userId, userId);
    // } else {
    //   where.push(`r.user_id = ?`);
    //   params.push(userId);
    // }

    where.push(`r.user_id = ?`);
    params.push(userId);

    if (search) {
      where.push(`(
      r.reason     LIKE ?
      OR r.type    LIKE ?
      OR u.fullname LIKE ?
    )`);
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (where.length) {
      query += " WHERE " + where.join(" AND ");
    }

    // Inline LIMIT/OFFSET instead of placeholders
    query += `
    ORDER BY r.created_at DESC
    LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}
  `;

    const [rows] = await this._db.execute(query, params);
    return rows;
  }

  /**
   * Hitung total request (untuk paging), struktur WHERE sama dengan getRequests.
   */
  async getRequestsCount(userId, role, search = "") {
    let query = `
      SELECT COUNT(*) AS count
      FROM requests r
      JOIN users u
        ON u.id = r.user_id
    `;
    const params = [];
    const whereClauses = [];

    // if (role !== 4) {
    //   whereClauses.push(`(
    //     r.user_id = ?
    //     OR EXISTS (
    //       SELECT 1
    //       FROM request_approvals rav
    //       WHERE rav.request_id = r.id
    //         AND rav.approver_id = ?
    //     )
    //   )`);
    //   params.push(userId, userId);
    // } else {
    //   whereClauses.push(`r.user_id = ?`);
    //   params.push(userId);
    // }

    whereClauses.push(`r.user_id = ?`);
    params.push(userId);

    if (search) {
      whereClauses.push(`(
        r.reason     LIKE ?
        OR r.type    LIKE ?
        OR u.fullname LIKE ?
      )`);
      const likeSearch = `%${search}%`;
      params.push(likeSearch, likeSearch, likeSearch);
    }

    if (whereClauses.length) {
      query += " WHERE " + whereClauses.join(" AND ");
    }
    console.log(
      "Executing query get requests count 1:",
      query,
      "with params:",
      params
    );
    const [rows] = await this._db.execute(query, params);
    return rows[0].count;
  }

  /**
   * Hitung jumlah request (untuk paging)
   */
  async getRequestsCount(userId, role, search = "") {
    let query = `
      SELECT COUNT(DISTINCT r.id) AS count
      FROM requests r
      JOIN users u ON u.id = r.user_id
    `;
    const params = [];
    const whereClauses = [];

    // if (role !== 4) {
    //   query += `
    //     LEFT JOIN request_approvals ra2
    //       ON ra2.request_id = r.id
    //   `;
    //   whereClauses.push(`( r.user_id = ? OR ra2.approver_id = ? )`);
    //   params.push(userId, userId);
    // } else {
    //   whereClauses.push(`r.user_id = ?`);
    //   params.push(userId);
    // }
    whereClauses.push(`r.user_id = ?`);
    params.push(userId);

    if (search) {
      whereClauses.push(`(
        r.reason LIKE ?
        OR r.type   LIKE ?
        OR u.fullname LIKE ?
      )`);
      const likeSearch = `%${search}%`;
      params.push(likeSearch, likeSearch, likeSearch);
    }

    if (whereClauses.length) {
      query += " WHERE " + whereClauses.join(" AND ");
    }
    console.log(
      "Executing query get requests count 2:",
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

    // 2) Check if any approvals are still pending
    const [remaining] = await this._db.execute(
      `
      SELECT COUNT(*) AS count
      FROM request_approvals
      WHERE request_id = ? AND status = 'pending'
      `,
      [requestId]
    );

    // 3) Only once there are no more 'pending' rows do we finalize the request.status
    // if (remaining[0].count === 0) {
    // a) total number of approvers
    const [allRows] = await this._db.execute(
      `
        SELECT COUNT(*) AS total
        FROM request_approvals
        WHERE request_id = ?
        `,
      [requestId]
    );
    const totalApprovers = allRows[0].total;

    // b) how many have approved
    const [approvedCountRow] = await this._db.execute(
      `
        SELECT COUNT(*) AS count
        FROM request_approvals
        WHERE request_id = ? AND status = 'approved'
        `,
      [requestId]
    );
    const approvedCount = approvedCountRow[0].count;

    // c) how many have rejected
    const [rejectedCountRow] = await this._db.execute(
      `
        SELECT COUNT(*) AS count
        FROM request_approvals
        WHERE request_id = ? AND status = 'rejected'
        `,
      [requestId]
    );
    const rejectedCount = rejectedCountRow[0].count;

    // d) decide final status
    let finalStatus;
    if (rejectedCount > 0) {
      // if any rejection, whole request is rejected
      finalStatus = "rejected";
    } else if (approvedCount === totalApprovers) {
      // only if everyone approved
      finalStatus = "approved";
    } else if (approvedCount < totalApprovers) {
      // if some approved, but not all, leave as pending
      finalStatus = "pending";
    } else {
      // should not normally happen since we've checked no pendings,
      // but as a safety fallback:
      finalStatus = "rejected";
    }

    // e) persist final status
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
