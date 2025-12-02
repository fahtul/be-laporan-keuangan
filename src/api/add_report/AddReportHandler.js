const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");

class AddReportHandler {
  constructor(addReportService, storageService, usersService, validator) {
    this._addReportService = addReportService;
    this._storageService = storageService;
    this._usersService = usersService;
    this._validator = validator;

    autoBind(this);
  }

  validateDeleteParams(params) {
    const { error } = this._validator.DeleteReportParamsSchema.validate(params);
    if (error) {
      throw new ClientError(
        error.details.map((d) => d.message).join(", "),
        400
      );
    }
  }

  async deleteReportHandler(request, h) {
    try {
      const { reportId } = request.params;
      const { id: userId } = request.auth.credentials;
      console.log(`Deleting report with ID: ${reportId} by user ID: ${userId}`);

      // 1) ensure the report exists and belongs to this user (or user is admin)
      let report;
      try {
        report = await this._addReportService.getReportById(reportId);
      } catch (err) {
        console.error("❌ Error fetching report:", err);
        throw new NotFoundError("Report tidak ditemukan");
      }

      // if not owner and not admin_status, reject
      const user = await this._usersService.getUserById(userId);
      if (report.owner_id !== userId && user[0].admin_status !== 1) {
        throw new ClientError("Anda tidak berhak menghapus laporan ini", 403);
      }

      // 2) delete DB record
      try {
        await this._addReportService.deleteReport(reportId);
      } catch (err) {
        console.error("❌ Error deleting report:", err);
        throw new ClientError("Gagal menghapus laporan", 500);
      }

      // 3) optionally delete the file from disk
      try {
        await this._storageService.deleteFile(report.file_name);
      } catch (e) {
        console.warn("⚠️ Gagal menghapus file fisik:", e);
      }

      return h.response({
        status: "success",
        message: "Laporan berhasil dihapus",
      });
    } catch (error) {
      console.error("❌ Error in deleteReportHandler:", error);
      throw new NotFoundError(
        "Laporan tidak ditemukan atau Anda bukan pemilik dokumen ini"
      );
    }
  }

  /**
   * Handler untuk menambahkan laporan dengan file PDF
   */
  async postReportWithFileHandler(request, h) {
    try {
      // 🔹 Destruktur payload harian
      const { addReportFile, title, description } = request.payload;

      // Validasi file FOTO (bukan PDF lagi)
      this._validator.validatePdfFile(addReportFile.hapi.headers); // <-- ini nanti isinya diubah ke image (lihat bagian validator)

      // Validasi payload laporan harian (title + desc + file)
      this._validator.validateInputReportCreationPayload(request.payload);

      // Ambil kredensial pengguna
      const { id: credentialId } = request.auth.credentials;

      // Validasi / ambil user
      const user = await this._usersService.getUserById(credentialId);

      // Simpan file foto yang diunggah
      const filename = await this._storageService.writeFile(
        addReportFile,
        addReportFile.hapi
      );

      // Simpan ke DB sebagai laporan harian
      const reportId = await this._addReportService.addReport(
        credentialId,
        title,
        description,
        user[0].division_id,
        user[0].unit_id,
        filename
      );

      const response = h.response({
        status: "success",
        message: "Laporan harian berhasil diunggah",
        data: {
          reportId,
          fileLocation: filename,
        },
      });
      response.code(201);
      return response;
    } catch (error) {
      console.error("Error uploading daily report:", error);
      return h
        .response({
          status: "fail",
          message: "Gagal mengunggah laporan harian",
        })
        .code(500);
    }
  }

  /**
   * Handler untuk mengambil laporan
   */
  async getReportsHandler(request, h) {
    try {
      // 🔹 Validate filter + pagination query (page, limit, title, start_date, end_date, ...)
      this._validator.validateGetReports(request.query);

      // 🔹 Ambil user & role
      const { id: credentialId } = request.auth.credentials;
      const user = await this._usersService.getUserById(credentialId);
      const roleId = user[0].role_id;
      const divisionId = user[0].division_id;
      const unitId = user[0].unit_id;
      const userId = user[0].id;
      const isShowAllMonthlyReport = user[0].is_show_all_monthly_report; // dipakai sebagai "boleh lihat semua"

      // 🔹 Ambil filter & pagination dari query
      const {
        page = 1,
        limit = 10,
        title,
        start_date,
        end_date,
        division_id: queryDivisionId,
        unit_id: queryUnitId,
      } = request.query;

      const filters = {
        title: title || null,
        startDate: start_date || null,
        endDate: end_date || null,
      };

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      console.log(
        `divisionId: ${divisionId}, unitId: ${unitId}, userId: ${userId} isShowAll: ${isShowAllMonthlyReport}`
      );

      // 🔹 Role-based logic (sekarang untuk laporan harian)
      if (roleId === 1 || isShowAllMonthlyReport) {
        // Role 1 (misalnya Direktur / Admin) bisa lihat semua, tapi boleh filter division_id dari query
        if (queryDivisionId) {
          filters.division_id = queryDivisionId;
        }
      } else if (roleId === 2) {
        // Role 2: dibatasi division, dan boleh filter unit (misalnya Kepala Divisi)
        filters.division_id = divisionId;
        if (queryUnitId) {
          filters.unit_id = queryUnitId;
        }
      } else if (roleId === 3) {
        // Role 3: dibatasi division + unit (misalnya Kepala Unit)
        filters.division_id = divisionId;
        filters.unit_id = unitId;
      } else if (roleId === 4) {
        // Role 4: dibatasi division + unit + owner (misalnya staff)
        filters.division_id = divisionId;
        filters.unit_id = unitId;
        filters.owner_id = userId;
      }

      // 🔹 Ambil data laporan (daily reports) + pagination
      const reports = await this._addReportService.getReports({
        ...filters,
        limit: limitNum,
        offset,
      });

      const totalReports = await this._addReportService.getReportsCount(
        filters
      );

      return {
        status: "success",
        data: {
          reports,
          meta: {
            page: pageNum,
            limit: limitNum,
            total: totalReports,
            totalReportResult: reports.length,
            totalPage: Math.ceil(totalReports / limitNum),
            nextPage: pageNum + 1,
            prevPage: pageNum - 1,
            firstPage: 1,
            lastPage: Math.ceil(totalReports / limitNum),
          },
        },
      };
    } catch (error) {
      console.error("Error fetching reports:", error);
      return h
        .response({
          status: "fail",
          message: "Gagal mengambil laporan",
        })
        .code(500);
    }
  }
}

module.exports = AddReportHandler;
