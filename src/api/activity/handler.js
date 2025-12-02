const autoBind = require("auto-bind");
const ClientError = require("../../exceptions/ClientError");

class ActivityHandler {
  constructor(service, usersService, validator) {
    this._service = service;
    this._usersService = usersService;
    this._validator = validator;

    autoBind(this);
  }

  async postActivityHandler(request, h) {
    try {
      await this._usersService.getIsUserAdmin(request.auth.credentials.id);
      this._validator.validateActivityPayload(request.payload);

      const ownerId = request.auth.credentials.id;

      const { activity_name } = request.payload;

      const activityId = await this._service.addActivity({
        activity_name: activity_name,
        owner_id: ownerId,
      });

      const response = h.response({
        status: "success",
        message: "Aktivitas berhasil ditambahkan",
        data: {
          activityId,
        },
      });
      response.code(201);
      return response;
    } catch (error) {
      console.error(error); // Log the error for debugging

      const response = h.response({
        status: "error",
        message: "Terjadi kesalahan saat menambahkan aktivitas",
      });
      response.code(500);
      return response;
    }
  }

  async getActivitiesHandler(request, h) {
    try {
      await this._usersService.getIsUserAdmin(request.auth.credentials.id);

      const { page = 1, limit = 10, activity_id, search } = request.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      const activities = await this._service.getActivities(limitNum, offset, {
        activity_id,
        search,
      });

      const totalActivity = await this._service.getActivityCount({
        activity_id,
        search,
      });

      return {
        status: "success",
        data: {
          activities,
          meta: {
            page: pageNum,
            limit: limitNum,
            total: totalActivity,
            totalActivityResult: activities.length,
            totalPage: Math.ceil(totalActivity / limitNum),
            nextPage:
              pageNum < Math.ceil(totalActivity / limitNum)
                ? pageNum + 1
                : null,
            prevPage: pageNum > 1 ? pageNum - 1 : null,
            firstPage: 1,
            lastPage: Math.ceil(totalActivity / limitNum),
          },
        },
      };
    } catch (error) {
      console.error("❌ Error in getActivitiesHandler:", error);

      return h
        .response({
          status: "fail",
          message:
            error.message || "Terjadi kesalahan saat mengambil aktivitas.",
        })
        .code(500);
    }
  }

  async getActivityByIdHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);

    const { id } = request.params;
    const activity = await this._service.getActivityById(id);

    return {
      status: "success",
      data: activity,
    };
  }

  async putActivityByIdHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    this._validator.validateActivityPayload(request.payload);

    const { id } = request.params;
    const { activity_name } = request.payload;
    const owner_id = request.auth.credentials.id;

    await this._service.updateActivityById(id, {
      activity_name,
      owner_id,
    });

    return {
      status: "success",
      message: "Aktivitas berhasil diperbarui",
    };
  }

  async deleteActivityByIdHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);

    const { id } = request.params;
    await this._service.deleteActivityById(id);

    return {
      status: "success",
      message: "Aktivitas berhasil dihapus",
    };
  }
}

module.exports = ActivityHandler;
