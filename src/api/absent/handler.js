const autoBind = require("auto-bind");

class AbsentHandler {
  constructor(service, usersService, validator) {
    this._service = service;
    this._usersService = usersService;
    this._validator = validator;

    autoBind(this);
  }

  async postAbsentHandler(request, h) {
    try {
    } catch (error) {
      console.error(error); // Log the error for debugging
    }
    this._validator.validateAbsentPayload(request.payload);

    const { activity_id, description } = request.payload;
    const ownerId = request.auth.credentials.id;

    const absentId = await this._service.addAbsent({
      activity_id,
      owner_id: ownerId,
      description,
    });

    const response = h.response({
      status: "success",
      message: "Absen berhasil ditambahkan",
      data: {
        absentId,
      },
    });
    response.code(201);
    return response;
  }

  async getAbsentsHandler(request, h) {
    try {
      const { page = 1, limit = 10, activity_id, search } = request.query;
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      const absents = await this._service.getAbsents(limitNum, offset, {
        activity_id,
        search,
      });
      const totalAbsent = await this._service.getAbsentCount({
        activity_id,
        search,
      });

      return {
        status: "success",
        data: {
          absents,
          meta: {
            page: pageNum,
            limit: limitNum,
            total: totalAbsent,
            totalPage: Math.ceil(totalAbsent / limitNum),
            nextPage:
              pageNum < Math.ceil(totalAbsent / limitNum) ? pageNum + 1 : null,
            prevPage: pageNum > 1 ? pageNum - 1 : null,
            firstPage: 1,
            lastPage: Math.ceil(totalAbsent / limitNum),
          },
        },
      };
    } catch (error) {
      console.error(error); // Log the error for debugging
    }
  }

  async getAbsentByIdHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    const data = await this._service.getAbsentById(id);
    return {
      status: "success",
      data,
    };
  }

  async putAbsentByIdHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    this._validator.validateAbsentPayload(request.payload);
    const ownerId = request.auth.credentials.id;

    const { id } = request.params;
    const { activity_id, description } = request.payload;

    await this._service.updateAbsentById(id, {
      activity_id,
      owner_id: ownerId,
      description,
    });

    return {
      status: "success",
      message: "Absen berhasil diperbarui",
    };
  }

  async deleteAbsentByIdHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const { id } = request.params;
    await this._service.deleteAbsentById(id);

    return {
      status: "success",
      message: "Absen berhasil dihapus",
    };
  }
}

module.exports = AbsentHandler;
