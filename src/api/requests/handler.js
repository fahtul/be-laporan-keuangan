// src/api/requests/handler.js
const autoBind = require("auto-bind");
const ClientError = require("../../exceptions/ClientError");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

class RequestsHandler {
  constructor(
    service,
    usersService,
    validator,
    storageService,
    fcmService, // Tambahkan service FCM
    emailService, // Tambahkan service Email,
    newWorkScheduleService // Tambahkan service NewWorkScheduleService jika diperlukan
  ) {
    this._service = service;
    this._usersService = usersService;
    this._validator = validator;
    this._storageService = storageService;
    this._fcmService = fcmService;
    this._emailService = emailService;
    this._newWorkScheduleService = newWorkScheduleService; // Simpan jika diperlukan
    autoBind(this);
  }

  /**
   * POST /requests
   */
  /**
   * Handler untuk membuat request baru beserta upload bukti foto
   */
  // Di dalam kelas RequestsHandler (misalnya di file src/api/requests/handler.js)
  async postRequestHandler(request, h) {
  // 🔍 Log payload type dan beberapa field penting dari awal
  console.log("🔎 [postRequestHandler] Raw payload type:", request.payload.type);
  console.log("🔎 [postRequestHandler] Raw payload (selected fields):", {
    type: request.payload.type,
    reason: request.payload.reason,
    request_date: request.payload.request_date,
    request_end_date: request.payload.request_end_date,
    start_time: request.payload.start_time,
    end_time: request.payload.end_time,
    shift_id: request.payload.shift_id,
  });

  // Normalize into an array so single uploads become [file]
  let photos = request.payload.evidence_photos;
  if (photos && !Array.isArray(photos)) {
    console.log("📸 evidence_photos is single file → normalize to array");
    photos = [photos];
  }

  // 1) Validate there is at least one photo, and each is an image
  try {
    if (!Array.isArray(photos) || photos.length === 0) {
      console.warn("⚠️ [postRequestHandler] No evidence_photos uploaded");
      throw new ClientError("Unggah minimal 1 Bukti.", 400);
    }
    console.log(`📸 [postRequestHandler] Total photos: ${photos.length}`);
    for (const [i, photo] of photos.entries()) {
      console.log(`📸 [postRequestHandler] Validating photo[${i}] filename:`, photo.hapi?.filename);
      this._validator.validateImageFile(photo.hapi.headers);
    }
  } catch (err) {
    return h
      .response({
        status: "fail",
        message: Array.isArray(err.details)
          ? err.details.map((d) => d.message).join(", ")
          : err.message,
      })
      .code(err.statusCode || 400);
  }

  // 2) Validate the rest of the payload structure
  try {
    console.log("✅ [postRequestHandler] Passing payload to validateRequestPayload()");
    await this._validator.validateRequestPayload(request.payload);
    console.log("✅ [postRequestHandler] validateRequestPayload() OK");
  } catch (err) {
    console.warn("❌ [postRequestHandler] validateRequestPayload() error:", err.message);
    return h
      .response({
        status: "fail",
        message: Array.isArray(err.details)
          ? err.details.map((d) => d.message).join(", ")
          : err.message,
      })
      .code(400);
  }

  // Extra log khusus untuk cek late_attendance
  if (request.payload.type === "late_attendance") {
    console.log("🐛 DEBUG [postRequestHandler] Detected type = late_attendance (Absen Susulan)");
  }

  if (request.payload.type === "overtime") {
    const { start_time, end_time } = request.payload;
    console.log("🕒 [Overtime] Start Time:", start_time);
    console.log("🕒 [Overtime] End Time:", end_time);

    const start = new Date(`1970-01-01T${start_time}:00`);
    let end = new Date(`1970-01-01T${end_time}:00`);

    // ✅ Handle overnight (e.g. 23:00 → 05:00 = +1 day)
    if (end <= start) {
      end.setDate(end.getDate() + 1);
      console.log("🌙 Overnight detected, end time moved to:", end);
    }

    console.log("📅 Parsed Start Date:", start);
    console.log("📅 Adjusted End Date:", end);

    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);
    console.log("⏱️ Duration in milliseconds:", diffMs);
    console.log("⏱️ Duration in hours:", diffHours);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.warn("⚠️ Invalid time format detected.");
      return h
        .response({
          status: "fail",
          message: "Format jam mulai atau jam selesai tidak valid.",
        })
        .code(400);
    }

    if (diffHours > 7) {
      console.warn("⚠️ Durasi lembur lebih dari 7 jam.");
      return h
        .response({
          status: "fail",
          message: "Durasi lembur tidak boleh lebih dari 7 jam.",
        })
        .code(400);
    }

    console.log("✅ Durasi lembur valid, lanjut proses...");
  }

  // 3) Retrieve authenticated user ID from JWT
  const { id: credentialId } = request.auth.credentials;
  console.log("👤 [postRequestHandler] credentialId:", credentialId);

  // 4) Load full user record
  let user;
  try {
    const rows = await this._usersService.getUserById(credentialId);
    user = rows[0];
    if (!user) {
      throw new ClientError("User tidak ditemukan.", 404);
    }
    console.log("👤 [postRequestHandler] Loaded user:", {
      id: user.id,
      fullname: user.fullname,
      role_id: user.role_id,
      unit_id: user.unit_id,
      division_id: user.division_id,
    });
  } catch (err) {
    console.error("❌ Error saat getUserById:", err);
    return h
      .response({ status: "fail", message: "User tidak ditemukan." })
      .code(err.statusCode || 500);
  }
  const {
    id: userId,
    role_id: roleId,
    unit_id: unitId,
    division_id: divisionId,
  } = user;

  // 5) Determine approver IDs two levels up
  let approverIds = [];
  try {
    approverIds = await this._usersService.getUserToNotifyTwoLevels(
      roleId,
      unitId,
      divisionId
    );
    console.log(
      "✅ [postRequestHandler] Approver IDs (two levels up):",
      approverIds
    );
  } catch (err) {
    console.error("❌ Error saat getUserToNotifyTwoLevels:", err);
    return h
      .response({ status: "fail", message: "Gagal mencari approver." })
      .code(500);
  }

  // 6) Save each uploaded photo, collect filenames
  const uploadedFileNames = [];
  try {
    for (const [i, photo] of photos.entries()) {
      const { hapi } = photo;
      console.log(
        `💾 [postRequestHandler] Saving photo[${i}] filename:`,
        hapi?.filename
      );
      const filename = await this._storageService.writeImageFile(photo, hapi);
      uploadedFileNames.push(filename);
      console.log(`✅ [postRequestHandler] Saved as: ${filename}`);
    }
    console.log(
      "📁 [postRequestHandler] All uploaded filenames:",
      uploadedFileNames
    );
  } catch (err) {
    console.error("❌ Error saat menyimpan file bukti:", err);
    return h
      .response({ status: "fail", message: "Gagal mengunggah file bukti." })
      .code(500);
  }

  // 7) Call createRequest and optionally notify approvers
  let requestId;
  const payloadForCreate = {
    userId,
    type: request.payload.type,
    reason: request.payload.reason,
    request_date: request.payload.request_date,
    request_end_date: request.payload.request_end_date,
    start_time: request.payload.start_time,
    end_time: request.payload.end_time,
    shift_id: request.payload.shift_id || null,
    evidence_photos: uploadedFileNames,
    approverIds,
  };
  console.log("📝 [postRequestHandler] Payload for createRequest:", payloadForCreate);

  try {
    requestId = await this._service.createRequest(payloadForCreate);
    console.log(
      "✅ [postRequestHandler] createRequest success. New requestId:",
      requestId
    );
  } catch (err) {
    console.error("❌ Error saat createRequest:", err);
    const code = err instanceof ClientError ? err.statusCode : 500;
    return h.response({ status: "fail", message: err.message }).code(code);
  }

  if (approverIds.length > 0) {
    // a) Push notification via FCM (optional)
    const notificationPayload = {
      title: `Permintaan Baru: ${request.payload.type}`,
      body: `User ${user.fullname} mengajukan ${request.payload.type}.`,
    };
    try {
      console.log(
        "📣 [postRequestHandler] Sending FCM notification to approverIds:",
        approverIds
      );
      await this._fcmService.sendNotification(
        approverIds,
        userId,
        notificationPayload
      );
      console.log("📣 Push notification terkirim ke:", approverIds);
    } catch (err) {
      console.error("❌ Gagal kirim push notification:", err);
    }

    // b) Email notification
    let approverEmails = [];
    try {
      approverEmails = await this._usersService.getUserEmailsByIds(
        approverIds
      );
      console.log("✉️ [postRequestHandler] Approver emails:", approverEmails);
    } catch (err) {
      console.error("❌ Error ambil email approver:", err);
    }
    for (const email of approverEmails) {
      if (!email) continue;
      try {
        await this._emailService.sendEmail(
          email,
          `Permintaan Baru dari ${user.fullname}`,
          `
Halo,

Anda menerima permintaan baru:

• Tipe Permintaan : ${request.payload.type}
• Pemohon          : ${user.fullname}
• Tanggal Mulai    : ${request.payload.request_date}
• Tanggal Akhir    : ${
            request.payload.request_end_date || request.payload.request_date
          }
• Jam Mulai        : ${request.payload.start_time || "-"}
• Jam Selesai      : ${request.payload.end_time || "-"}
• Foto Bukti      : ${uploadedFileNames.join(", ")}

Silakan cek dashboard Anda untuk persetujuan.
          `.trim()
        );
        console.log(`✉️ Email terkirim ke ${email}`);
      } catch (err) {
        console.error(`❌ Gagal kirim email ke ${email}:`, err.message);
      }
    }
  }

  // 8) Return success
  const response = h.response({
    status: "success",
    message: "Permintaan berhasil dibuat",
    data: { requestId },
  });
  response.code(201);
  return response;
}


  /**
   * GET /requests
   * Query parameters: page, limit, search
   */
  async getRequestsHandler(request, h) {
    try {
      const {
        id: userId,
        unit_id: unitId,
        division_id: divisionId,
        role: userRole,
      } = request.auth.credentials;
      const { page = 1, limit = 10, search = "" } = request.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      // Ambil daftar request sesuai role + search + paging
      const requests = await this._service.getRequests(
        userId,
        userRole,
        limitNum,
        offset,
        search
      );
      const totalRequests = await this._service.getRequestsCount(
        userId,
        userRole,
        search
      );

      return {
        status: "success",
        data: {
          requests,
          meta: {
            page: pageNum,
            limit: limitNum,
            total: totalRequests,
            totalRequestResult: requests.length,
            totalPage: Math.ceil(totalRequests / limitNum),
            nextPage:
              pageNum < Math.ceil(totalRequests / limitNum)
                ? pageNum + 1
                : null,
            prevPage: pageNum > 1 ? pageNum - 1 : null,
            firstPage: 1,
            lastPage: Math.ceil(totalRequests / limitNum),
          },
        },
      };
    } catch (error) {
      console.error("❌ Error in getRequestsHandler:", error);
      return h
        .response({
          status: "fail",
          message:
            error.message || "Terjadi kesalahan saat mengambil data request.",
        })
        .code(500);
    }
  }

  /**
   * GET /requests/{id}
   */
  async getRequestByIdHandler(request, h) {
    const { id } = request.params;
    try {
      const data = await this._service.getRequestDetail(id);
      return {
        status: "success",
        data,
      };
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "fail", message: err.message || "Tidak ditemukan" })
        .code(404);
    }
  }

  /**
   * PUT /requests/{id}   (update request by owner sebelum approval)
   */
  async putRequestHandler(request, h) {
    const { id: requestId } = request.params;
    const { id: userId } = request.auth.credentials;

    try {
      await this._validator.validateRequestPayload(request.payload);
    } catch (err) {
      return h
        .response({
          status: "fail",
          message: err.details
            ? err.details.map((d) => d.message).join(", ")
            : err.message,
        })
        .code(400);
    }

    try {
      await this._service.updateRequest(requestId, userId, request.payload);
      return {
        status: "success",
        message: "Permintaan berhasil diperbarui",
      };
    } catch (err) {
      console.error(err);
      const code = err instanceof ClientError ? err.statusCode : 500;
      return h.response({ status: "fail", message: err.message }).code(code);
    }
  }

  /**
   * PUT /requests/{id}/approve   (approve/reject oleh approver)
   * payload: { status: "approved"|"rejected", note: "..." }
   */
  async putApprovalHandler(request, h) {
    const requestId = request.params.id;
    const approverId = request.auth.credentials.id;

    // 1) validate incoming payload
    try {
      await this._validator.validateApprovalPayload(request.payload);
    } catch (err) {
      return h
        .response({
          status: "fail",
          message: Array.isArray(err.details)
            ? err.details.map((d) => d.message).join(", ")
            : err.message,
        })
        .code(400);
    }

    // 2) update the approval record
    try {
      await this._service.updateApproval({
        requestId,
        approverId,
        status: request.payload.status,
        note: request.payload.note,
      });
    } catch (err) {
      console.error(err);
      const code = err instanceof ClientError ? err.statusCode : 500;
      return h.response({ status: "fail", message: err.message }).code(code);
    }
    console.log(
      "Status approval",
      request.payload.status,
      "untuk request ID:",
      requestId
    );

    // 3) if the payload said "approved", see if that was the **final** approval
    if (request.payload.status === "approved") {
      // fetch the request details (type, date, user_id, etc.)
      const req = await this._service.getRequestDetail(requestId);

      // map your business‐specific request type → schedule_category id
      const categoryMap = {
        overtime: "cat-overtime", // use your actual IDs here
        time_off: "cat-time_off",
        shift_change: "cat-manual",
        manual_attendance: "cat-manual",
        sick: "sick",
      };
      const categoryId = categoryMap[req.type];
      console.log(">> Category ID for request type:", categoryId);
      if (categoryId) {
        // write it into your calendar table
        await this._newWorkScheduleService.assignMonthlySchedules({
          user_id: req.user_id,
          assignments: [{ date: req.request_date, category_id: categoryId }],
        });
      }
    }

    return {
      status: "success",
      message: "Status approval berhasil diperbarui",
    };
  }

  /**
   * GET /requests/pending   (untuk melihat daftar request yang menunggu approval user ini)
   */
  async getPendingApprovalsHandler(request, h) {
    const approverId = request.auth.credentials.id;
    console.log(">> Approver ID:", approverId);

    try {
      const rows = await this._service.getPendingApprovals(approverId);
      console.log(">> Pending Approvals Rows:", rows);
      return { status: "success", data: rows };
    } catch (err) {
      console.error("❌ Error getPendingApprovals:", err);
      return h
        .response({ status: "fail", message: "Gagal mengambil data approval" })
        .code(500);
    }
  }

  /**
   * GET /requests/export
   * Exports all requests into an Excel file, grouped by user.
   */
  async exportRequestsHandler(request, h) {
    try {
      await this._usersService.getIsUserAdmin(request.auth.credentials.id);
      // 1) fetch raw data
      const rows = await this._service.exportRequestsRekap();

      // 2) build workbook & worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Requests");
      worksheet.columns = [
        { header: "User ID", key: "userId", width: 20 },
        { header: "Full Name", key: "fullname", width: 30 },
        { header: "Type", key: "type", width: 15 },
        { header: "Reason", key: "reason", width: 40 },
        { header: "Request Date", key: "request_date", width: 15 },
        { header: "End Date", key: "request_end_date", width: 15 },
        { header: "Start Time", key: "start_time", width: 12 },
        { header: "End Time", key: "end_time", width: 12 },
        { header: "Shift ID", key: "shift_id", width: 10 },
        { header: "Status", key: "status", width: 12 },
      ];

      // helper to format a date-only cell
      const formatDate = (val) => {
        if (!val) return "";
        const d = new Date(val);
        return isNaN(d) ? "" : d.toISOString().substr(0, 10);
      };

      // 3) insert rows, blank line between users
      let lastUser = null;
      for (const r of rows) {
        if (lastUser && lastUser !== r.userId) {
          worksheet.addRow({}); // blank row separator
        }
        lastUser = r.userId;

        worksheet.addRow({
          userId: r.userId,
          fullname: r.fullname,
          type: r.type,
          reason: r.reason || "",
          request_date: formatDate(r.request_date),
          request_end_date: formatDate(r.request_end_date),
          start_time: r.start_time || "",
          end_time: r.end_time || "",
          shift_id: r.shift_id ?? "",
          status: r.status,
        });
      }

      // 4) save to disk
      const filename = `requests_rekap_${Date.now()}.xlsx`;
      const uploadDir = path.resolve(__dirname, "../../uploads/requests");
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);
      await workbook.xlsx.writeFile(filePath);

      // 5) return as download
      return h.file(filePath, {
        filename,
        confine: false,
        mode: "attachment",
      });
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  /**
   * GET /requests/export/{type}
   * Exports only requests of the given type as an Excel file.
   */
  async exportRequestsByTypeHandler(request, h) {
    try {
      await this._usersService.getIsUserAdmin(request.auth.credentials.id);
      const { type } = request.params;
      // 1) Fetch filtered data
      const rows = await this._service.exportRequestsRekapByType(type);

      // 2) Create workbook + one sheet named after the type
      const workbook = new ExcelJS.Workbook();
      const sheetName = type.length > 31 ? type.substr(0, 31) : type;
      const worksheet = workbook.addWorksheet(sheetName);

      worksheet.columns = [
        { header: "User ID", key: "userId", width: 20 },
        { header: "Full Name", key: "fullname", width: 30 },
        { header: "Request Date", key: "request_date", width: 15 },
        { header: "End Date", key: "request_end_date", width: 15 },
        { header: "Start Time", key: "start_time", width: 12 },
        { header: "End Time", key: "end_time", width: 12 },
        { header: "Shift ID", key: "shift_id", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Reason", key: "reason", width: 40 },
      ];

      // helper to format date-only
      const formatDate = (val) => {
        if (!val) return "";
        const d = new Date(val);
        return isNaN(d) ? "" : d.toISOString().substr(0, 10);
      };

      // 3) populate rows
      rows.forEach((r) => {
        worksheet.addRow({
          userId: r.userId,
          fullname: r.fullname,
          request_date: formatDate(r.request_date),
          request_end_date: formatDate(r.request_end_date),
          start_time: r.start_time || "",
          end_time: r.end_time || "",
          shift_id: r.shift_id ?? "",
          status: r.status,
          reason: r.reason || "",
        });
      });

      // 4) write file
      const filename = `requests_${type}_${Date.now()}.xlsx`;
      const uploadDir = path.resolve(__dirname, "../../uploads/requests");
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);
      await workbook.xlsx.writeFile(filePath);

      // 5) return as download
      return h.file(filePath, {
        filename,
        confine: false,
        mode: "attachment",
      });
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  async listAll(request) {
    const {
      limit,
      offset,
      search,
      status,
      type,
      user_id: userId,
      approver_id: approverId,
      date_from: dateFrom,
      date_to: dateTo,
      order_by: orderBy,
      order_dir: orderDir,
    } = request.query || {};

    const data = await this._service.listAllWithDetails({
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      search,
      status,
      type,
      userId,
      approverId,
      dateFrom,
      dateTo,
      orderBy,
      orderDir,
    });

    return { status: "success", data };
  }

  async getOne(request) {
    const { id } = request.params;
    if (!id) throw new InvariantError("id required");
    const data = await this._service.getRequestWithDetails(Number(id));
    return { status: "success", data };
  }

  // PATCH /requests/{id}/status
  async setStatus(request) {
    const { id } = request.params;
    const { status, note } = request.payload || {};
    if (!status) throw new InvariantError("status required");

    // if you track adminId (e.g. from JWT), pass it along; otherwise null
    const adminId = request.auth?.credentials?.id || null;

    const data = await this._service.updateRequestStatus(
      Number(id),
      String(status),
      note || null,
      adminId
    );
    return { status: "success", data };
  }
  async exportRequestsSummaryHandler(request, h) {
    try {
      const { dateFrom, dateTo, type, status } = request.query;

      console.log("📌 Export Request Params:", {
        dateFrom,
        dateTo,
        type,
        status,
      });

      // 1) Get data from service
      const rows = await this._service.exportRequestsSummary({
        dateFrom,
        dateTo,
        type,
        status,
      });

      if (!rows.length) {
        return h
          .response({
            status: "fail",
            message: "Tidak ada data untuk kriteria yang dipilih.",
          })
          .code(404);
      }

      // 2) Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Rekap Request");

      // 3) Header
      sheet.columns = [
        { header: "No", key: "no", width: 5 },
        { header: "Nama Karyawan", key: "user_name", width: 25 },
        { header: "Tipe", key: "type", width: 15 },
        { header: "Status", key: "status", width: 15 },
        { header: "Tanggal Mulai", key: "request_date", width: 15 },
        { header: "Tanggal Selesai", key: "request_end_date", width: 15 },
        { header: "Total Hari", key: "total_days", width: 10 },
        { header: "Alasan", key: "reason", width: 30 },
      ];

      // 4) Fill data
      rows.forEach((row, index) => {
        sheet.addRow({
          no: index + 1,
          ...row,
        });
      });

      // 5) Styling header
      sheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      // 6) Export to buffer
      const buffer = await workbook.xlsx.writeBuffer();

      return h
        .response(buffer)
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header(
          "Content-Disposition",
          `attachment; filename="rekap_requests_${Date.now()}.xlsx"`
        );
    } catch (err) {
      console.error("❌ Error in exportRequestsSummaryHandler:", err);
      return h
        .response({
          status: "fail",
          message: err.message || "Terjadi kesalahan saat export data",
        })
        .code(500);
    }
  }

  async deleteRequestHandler(request, h) {
    const { id } = request.params;
    const { id: credentialId } = request.auth.credentials;

    try {
      // 1) delete from DB (also deletes approvals), get filenames back
      const { evidenceNames } = await this._service.deleteRequest(
        id,
        credentialId
      );

      // 2) attempt to unlink files (ignore if missing)
      const uploadsDir = path.resolve(__dirname, "../../../requests");
      for (const filename of evidenceNames) {
        const filePath = path.join(uploadsDir, filename);
        try {
          if (fssync.existsSync(filePath)) {
            await fs.unlink(filePath);
          }
        } catch (e) {
          // don't block delete for file errors
          console.warn(`⚠️ Gagal hapus file ${filename}:`, e.message);
        }
      }

      return h
        .response({
          status: "success",
          message: "Request berhasil dihapus.",
          data: { id: Number(id) },
        })
        .code(200);
    } catch (err) {
      const code = err.statusCode || 500;
      const msg =
        err instanceof ClientError
          ? err.message
          : "Terjadi kesalahan saat menghapus request.";
      return h.response({ status: "fail", message: msg }).code(code);
    }
  }
}

module.exports = RequestsHandler;
