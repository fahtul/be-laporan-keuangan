// src/api/attendance/handler.js
const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");
const fs = require("fs");
const path = require("path");
const json2csv = require("json2csv").parse;
const ExcelJS = require("exceljs");

class AttendanceHandler {
  constructor(service, usersService, validator) {
    this._service = service;
    this._usersService = usersService;
    this._validator = validator;
    autoBind(this);
  }

  /**
   * Save the incoming file stream to disk and return a relative URL path.
   */
  async _saveFile(fileStream, filename) {
    const uploadDir = path.resolve(__dirname, "../../uploads/attendance");
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const absPath = path.join(uploadDir, filename);
    const writeStream = fs.createWriteStream(absPath);
    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream);
      fileStream.on("end", resolve);
      fileStream.on("error", reject);
    });

    // Return the relative path (for HTTP serving)
    return `uploads/attendance/${filename}`;
  }

  /**
   * Handler for POST /attendance/checkin
   */
  async postCheckinHandler(request, h) {
    const { latitude, longitude, photo } = request.payload;
    this._validator.validateAttendancePayload({ latitude, longitude });

    if (!photo || !photo.hapi) {
      throw new InvariantError("Photo is required");
    }

    const filename = `${Date.now()}-${photo.hapi.filename}`;
    // relative path, not absolute
    const photoPath = await this._saveFile(photo, filename);

    try {
      const data = await this._service.record(
        request.auth.credentials.id,
        "checkin",
        latitude,
        longitude,
        photoPath
      );
      return h.response({ status: "success", data }).code(201);
    } catch (err) {
      // optionally remove the saved file on failure
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  /**
   * Handler for POST /attendance/checkout
   */
  async postCheckoutHandler(request, h) {
    const { latitude, longitude, photo } = request.payload;
    this._validator.validateAttendancePayload({ latitude, longitude });

    if (!photo || !photo.hapi) {
      throw new InvariantError("Photo is required");
    }

    const filename = `${Date.now()}-${photo.hapi.filename}`;
    const photoPath = await this._saveFile(photo, filename);

    try {
      const data = await this._service.record(
        request.auth.credentials.id,
        "checkout",
        latitude,
        longitude,
        photoPath
      );
      return h.response({ status: "success", data }).code(201);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  /**
   * Handler for GET /attendance/history
   */
  async getHistoryHandler(request, h) {
    const userId = request.auth.credentials.id;
    try {
      const records = await this._service.getHistory(userId);
      return h.response({
        status: "success",
        data: { records },
      });
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Gagal mengambil riwayat" })
        .code(500);
    }
  }

  async getPayrollHandler(request, h) {
    const userId = request.auth.credentials.id;
    const yearMonth = request.query.month; // e.g. "2025-05"
    try {
      const data = await this._service.computePayroll(userId, yearMonth);
      return h.response({ status: "success", data }).code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({
          status: "fail",
          message: err.message || "Gagal menghitung payroll",
        })
        .code(400);
    }
  }

  /**
   * GET /attendances?month=YYYY-MM[&userId=...]
   */
  async getAllAttendanceHandler(request, h) {
    // validasi query
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    this._validator.validateGetAllQuery(request.query);

    const { month, userId } = request.query;
    try {
      const attendances = await this._service.getAllAttendancesByMonth(
        month,
        userId || null
      );
      return h.response({ status: "success", data: { attendances } }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // Export Attendance for a Specific User
  async exportUserAttendanceHandler(request, h) {
    const userId = request.auth.credentials.id;

    try {
      // Fetch user attendance history
      const records = await this._service.getHistory(userId);

      // Convert records to CSV format
      const csvData = json2csv(records);

      // Set the file path for the CSV
      const filename = `attendance_user_${userId}_${Date.now()}.csv`;
      const filePath = path.resolve(
        __dirname,
        "../../uploads/attendance",
        filename
      );

      // Save CSV to disk
      fs.writeFileSync(filePath, csvData);

      // Return the file for download
      return h.file(filePath, {
        filename: filename,
        confine: false, // Allow downloading from a specific folder
      });
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // Export Attendance for All Users
  async exportAllUsersAttendanceHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    // Fetch all users' attendance data
    const allUsersRekap = await this._service.exportAllUsersAttendanceRekap();

    // Convert to CSV format
    const csvData = json2csv(allUsersRekap);

    // Set the file path for the CSV
    const filename = `attendance_all_users_${Date.now()}.csv`;
    const filePath = path.resolve(
      __dirname,
      "../../uploads/attendance",
      filename
    );

    // Save CSV to disk
    fs.writeFileSync(filePath, csvData);

    // Return the file for download
    return h.file(filePath, {
      filename: filename,
      confine: false, // Allow downloading from a specific folder
    });
  }

  /**
   * GET /attendance/export-all-users-excel
   */
  async exportAllUsersAttendanceExcel(request, h) {
    try {
      await this._usersService.getIsUserAdmin(request.auth.credentials.id);
      // 1) Get the raw rekap data
      const allUsersRekap = await this._service.exportAllUsersAttendanceRekap();

      // 2) Build workbook & sheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Attendance");

      worksheet.columns = [
        { header: "Username", key: "username", width: 20 },
        { header: "Full Name", key: "fullname", width: 30 },
        { header: "Date", key: "date", width: 12 },
        { header: "Check-in", key: "checkin", width: 10 },
        { header: "Checkout", key: "checkout", width: 10 },
      ];

      // helper: pull HH:mm from ISO or return "N/A"
      const formatTime = (iso) => {
        if (!iso) return "N/A";
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
      };

      // 3) Fill rows, blank row between users
      let lastUser = null;
      for (const user of allUsersRekap) {
        if (lastUser && lastUser !== user.userId) {
          worksheet.addRow({}); // blank separator row
        }
        lastUser = user.userId;

        for (const att of user.attendance) {
          worksheet.addRow({
            username: user.username,
            fullname: user.fullname,
            date: att.date,
            checkin: formatTime(att.checkin),
            checkout: formatTime(att.checkout),
          });
        }
      }

      // 4) Write file
      const filename = `attendance_all_users_${Date.now()}.xlsx`;
      const filePath = path.resolve(
        __dirname,
        "../../uploads/attendance",
        filename
      );
      await workbook.xlsx.writeFile(filePath);

      // 5) Return download
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

  async updateTimesHandler(request, h) {
    // Require admin
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);

    // Validate + normalize payload
    const payload = this._validator.validateManualTimesPayload(request.payload);

    try {
      await this._service.upsertManualTimes(
        payload.userId,
        payload.date,
        payload.clockIn || null,
        payload.clockOut || null,
        payload.source || "manual_edit",
        request.auth?.credentials?.id || null
      );

      return h.response({ success: true }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }
}

module.exports = AttendanceHandler;
