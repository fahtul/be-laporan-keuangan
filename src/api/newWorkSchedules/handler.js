const autoBind = require("auto-bind");

class WorkScheduleHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  async createCategoryHandler(request, h) {
    this._validator.validateCreateCategory(request.payload);
    const id = await this._service.createCategory(request.payload);

    return h
      .response({
        status: "success",
        message: "Kategori jadwal berhasil dibuat",
        data: { id },
      })
      .code(201);
  }

  async assignSchedulesHandler(request, h) {
    try {
      const { month, assignments } = request.payload;

      if (!month || !assignments || !Array.isArray(assignments)) {
        throw new InvariantError("month and assignments[] are required");
      }

      for (const item of assignments) {
        if (!item.user_id || !item.schedules) {
          throw new InvariantError(
            "Each assignment must have user_id and schedules"
          );
        }

        const userId = await this._service.getUserIdByUsername(item.user_id); // now using username

        await this._service.assignMonthlySchedules({
          user_id: userId,
          assignments: item.schedules,
        });
      }

      return {
        status: "success",
        message: "Jadwal berhasil ditetapkan",
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getAllCategoriesHandler(request, h) {
    const categories = await this._service.getAllCategories();
    return {
      status: "success",
      data: { categories },
    };
  }

  async getCategoryByIdHandler(request, h) {
    const { id } = request.params;
    const category = await this._service.getCategoryById(id);
    return {
      status: "success",
      data: category,
    };
  }

  async updateCategoryHandler(request, h) {
    try {
      const { id } = request.params;
      this._validator.validateCreateCategory(request.payload);
      await this._service.updateCategory(id, request.payload);

      return {
        status: "success",
        message: "Kategori berhasil diperbarui",
      };
    } catch (error) {
      console.error(error);
    }
  }

  async deleteCategoryHandler(request, h) {
    const { id } = request.params;
    await this._service.deleteCategory(id);

    return {
      status: "success",
      message: "Kategori berhasil dihapus",
    };
  }

  async getUserSchedulesHandler(request, h) {
    try {
      const { user_id, month } = request.query;
      if (!month) {
        return h
          .response({ status: "fail", message: "month is required" })
          .code(400);
      }
      const schedules = await this._service.getUserSchedules(user_id, month);
      console.log(schedules);

      return {
        status: "success",
        data: { schedules },
      };
    } catch (error) {
      console.error(error);
    }
  }

  async deleteUserScheduleHandler(request, h) {
    const { user_id, date } = request.params;
    await this._service.deleteUserSchedule(user_id, date);

    return {
      status: "success",
      message: "Jadwal berhasil dihapus",
    };
  }

  async upsertUserScheduleHandler(request, h) {
    const { user_id, date } = request.params; // date: YYYY-MM-DD
    const { category_id } = request.payload || {};
    if (!category_id) {
      throw new InvariantError("category_id is required");
    }

    const result = await this._service.upsertUserSchedule({
      user_id,
      date,
      category_id,
    });

    return {
      status: "success",
      message: `Jadwal ${result.action}`,
      data: { id: result.id },
    };
  }

  // jika file handler sudah ada, tambahkan method berikut:
  async getScheduleForDateHandler(request, h) {
    const userId = request.auth.credentials.id;
    const date = request.params.date;
    // validate date format minimal 'YYYY-MM-DD' jika perlu
    const schedule = await this._service.getScheduleForDate(userId, date);
    return h.response({ status: "success", data: { schedule } }).code(200);
  }
}

module.exports = WorkScheduleHandler;
