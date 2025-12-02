const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");

class AddAbsentHandler {
  constructor(addAbsentService, validator) {
    this._addAbsentService = addAbsentService;
    this._validator = validator;

    autoBind(this);
  }

  async postAbsentHandler(request, h) {
    this._validator.validateInputAbsentCreationPayload(request.payload);
    
    const {
      division,
      position,
      activityType,
      description,
      durationHours,
      durationMinutes
    } = request.payload;

    await this._service.addAbsent(request.auth.credentials.id, {
      division,
      position,
      activityType,
      description,
      durationHours,
      durationMinutes
    });

    const response = h.response({
      status: "success",
      message: "Absent berhasil ditambahkan",
    });
    response.code(201);
    return response;
  }
}

module.exports = AddAbsentHandler;
