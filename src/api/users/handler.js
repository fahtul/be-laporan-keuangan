const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");
const { logError } = require("../../utils/logger");
const streamToBuffer = require("../../utils/streamToBuffer");

class UserHandler {
  constructor(service, unitsService, validator) {
    this._service = service;
    this._unitsService = unitsService;
    this._validator = validator;

    autoBind(this);
  }

  async postUserHandler(request, h) {
    // try {
    this._validator.validateUserPayload(request.payload);
    const {
      username,
      fullname,
      password,
      divisionId = "",
      unitId = "",
      roleId,
      adminStatus,
      basicSalary = 0,
      hired_date,
    } = request.payload;

    if (unitId !== "") {
      const division = await this._unitsService.getUnitById(unitId);
      if (!division) {
        throw new NotFoundError("Unit tidak ditemukan");
      } else {
        if (divisionId !== division) {
          throw new NotFoundError("Divisi tidak sesuai");
        }
      }
    }

    await this._service.addUser(request.auth.credentials.id, {
      username,
      fullname,
      password,
      divisionId,
      unitId,
      roleId,
      adminStatus,
      basicSalary,
      hired_date,
    });

    const response = h.response({
      status: "success",
      message: "User berhasil ditambahkan",
    });
    response.code(201);
    return response;
    // } catch (error) {
    //   console.error("❌ Error in postUserHandler:", error);
    // }
  }

  async updateUserHandler(request, h) {
    this._validator.validateUpdateUserPayload(request.payload);
    const {
      fullname,
      divisionId = "",
      unitId = "",
      roleId,
      adminStatus,
      basicSalary = 0,
    } = request.payload;

    const { id } = request.params;

    if (unitId !== "") {
      const division = await this._unitsService.getUnitById(unitId);
      if (!division) {
        throw new NotFoundError("Unit tidak ditemukan");
      } else {
        if (divisionId !== division) {
          throw new NotFoundError("Divisi tidak sesuai");
        }
      }
    }

    await this._service.updateUser(request.auth.credentials.id, {
      id,
      fullname,
      divisionId,
      unitId,
      roleId,
      adminStatus,
      basicSalary,
    });

    return {
      status: "success",
      message: "User berhasil diupdate",
    };
  }

  async updateUserPasswordHandler(request, h) {
    this._validator.validateUpdateUserPasswordPayload(request.payload);
    const { username, currentPassword, newPassword } = request.payload;

    await this._service.updatePassword(username, currentPassword, newPassword);

    return {
      status: "success",
      message: "User berhasil diupdate",
    };
  }

  async updateUserStatusHandler(request, h) {
    await this._service.updateUserStatus(request.auth.credentials.id);
    return {
      status: "success",
      message: "User berhasil diupdate",
    };
  }

  async deleteUserByIdHandler(request, h) {
    const { id } = request.params;
    this._validator.validateDeleteUserId(id);

    await this._service.deleteUserById(request.auth.credentials.id, id);
    return {
      status: "success",
      message: "User berhasil dihapus",
    };
  }

  async getUserByIdHandler(request, h) {
    const { id } = request.params;
    const user = await this._service.getUserById(id);

    return {
      status: "success",
      data: {
        user,
      },
    };
  }

  async getUsers(request, h) {
    try {
      this._validator.validateGetUsers(request.params);
      
      const {
        page = 1,
        limit = 100,
        search = "",
        is_active, // 👈 NEW: e.g. "1", "2", "1,2", "all"
      } = request.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;
      const id = request.auth.credentials.id;

      // 🔍 normalize status filter to an array of numbers [1], [2], [1,2] or []
      let statusFilter = [];
      if (is_active && is_active !== "all") {
        if (Array.isArray(is_active)) {
          // e.g. ?is_active=1&is_active=2
          statusFilter = is_active
            .map((v) => Number(v))
            .filter((v) => [1, 2].includes(v));
        } else {
          // e.g. ?is_active=1,2 or ?is_active=1
          statusFilter = String(is_active)
            .split(",")
            .map((v) => Number(v.trim()))
            .filter((v) => [1, 2].includes(v));
        }
      }
      // if "all" or not provided -> statusFilter = [] (no filter)

      const users = await this._service.getUsers(
        id,
        limitNum,
        offset,
        search,
        statusFilter
      );

      const totalUsers = await this._service.getUserCount(search, statusFilter);

      return {
        status: "success",
        data: {
          users,
          meta: {
            page: pageNum,
            limit: limitNum,
            total: totalUsers,
            totalUserResult: users.length,
            totalPage: Math.ceil(totalUsers / limitNum),
            nextPage: pageNum + 1,
            prevPage: pageNum - 1,
            firstPage: 1,
            lastPage: Math.ceil(totalUsers / limitNum),
          },
        },
      };
    } catch (error) {
      console.error("❌ Error in getUsers:", error);
      return h
        .response({
          status: "fail",
          message:
            error.message || "Terjadi kesalahan saat mengambil data pengguna.",
        })
        .code(500);
    }
  }

  async exportUsersExcelHandler(request, h) {
    try {
      await this._service.getIsUserAdmin(request.auth.credentials.id);
      const buffer = await this._service.exportUsersExcel();

      return h
        .response(buffer)
        .header(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        .header("Content-Disposition", 'attachment; filename="users.xlsx"');
    } catch (err) {
      return h
        .response({
          status: "fail",
          message: err.message || "Failed to export user data",
        })
        .code(500);
    }
  }

  async importUserSalaryHandler(request, h) {
    try {
      await this._service.getIsUserAdmin(request.auth.credentials.id);
      const fileStream = request.payload.file;

      // Convert stream to buffer
      const buffer = await streamToBuffer(fileStream);

      // Call service
      const results = await this._service.importUserSalaries(buffer);

      return h
        .response({
          status: "success",
          message: "Import complete",
          data: { results },
        })
        .code(200);
    } catch (err) {
      console.error("❌ Import salary failed:", err);
      return h
        .response({
          status: "fail",
          message: err.message,
        })
        .code(400);
    }
  }
}

module.exports = UserHandler;
