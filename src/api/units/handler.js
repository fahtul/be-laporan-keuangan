const autoBind = require("auto-bind");

class UnitHandler {
  constructor(service, usersService, validator) {
    this._service = service;
    this._usersService = usersService;
    this._validator = validator;

    autoBind(this);
  }

  async postUnitHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    this._validator.validateUnitPayload(request.payload);
    const { name, divisionId } = request.payload;

    const unitId = await this._service.addUnit({
      name,
      divisionId,
    });

    const response = h.response({
      status: "success",
      message: "Unit berhasil ditambahkan",
      data: {
        unitId,
      },
    });
    response.code(201);
    return response;
  }

  async getUnitsHandler(request, h) {
    // await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const data = await this._service.getUnits();
    return {
      status: "success",
      data,
    };
  }
}

module.exports = UnitHandler;
