const autoBind = require("auto-bind");
const ClientError = require("../../exceptions/ClientError");

class DivisionHandler {
  constructor(service, usersService, validator) {
    this._service = service;
    this._usersService = usersService;
    this._validator = validator;

    autoBind(this);
  }

  async postDivisionHandler(request, h) {
    await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    this._validator.validateDivisionPayload(request.payload);
    const { name } = request.payload;

    const divisionId = await this._service.addDivision({
      name,
    });

    const response = h.response({
      status: "success",
      message: "Divisi berhasil ditambahkan",
      data: {
        divisionId,
      },
    });
    response.code(201);
    return response;
  }

  async getDivisionsHandler(request, h) {
    // await this._usersService.getIsUserAdmin(request.auth.credentials.id);
    const data = await this._service.getDivisions();
    return {
      status: "success",
      data,
    };
  }
}

module.exports = DivisionHandler;
