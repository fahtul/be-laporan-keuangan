const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");

class JobdeskHandler {
  constructor(
    jobdeskService,
    storageService,
    unitService,
    divisionService,
    usersService,
    jobdeskCollaborationService,
    validator
  ) {
    this._jobdeskService = jobdeskService;
    this._storageService = storageService;
    this._unitService = unitService;
    this._divisionService = divisionService;
    this._usersService = usersService;
    this._jobdeskCollaborationService = jobdeskCollaborationService;
    this._validator = validator;

    autoBind(this);
  }
  async postJobdeskWithFileHandler(request, h) {
    const { jobdeskFile } = request.payload;
    this._validator.validateJobdeskFile(jobdeskFile.hapi.headers);
    this._validator.validateJobdeskPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    await this._usersService.getIsUserAdmin(credentialId);

    const { unitId, divisionId, title, description } = request.payload;
    const division = await this._unitService.getUnitById(unitId);
    if (!division) {
      throw new NotFoundError("Unit tidak ditemukan");
    } else {
      if (divisionId !== division) {
        throw new NotFoundError("Divisi tidak sesuai");
      }
    }

    const filename = await this._storageService.writeFile(
      jobdeskFile,
      jobdeskFile.hapi
    );
    const id = await this._jobdeskService.addJobdesk(
      credentialId,
      unitId,
      divisionId,
      title,
      description,
      filename
    );

    await this._jobdeskCollaborationService.addJobdeskCollaborationByUser(id, [
      credentialId,
    ]);

    const response = h.response({
      status: "success",
      message: "Jobdesk berhasil diunggah",
      data: {
        fileLocation: `${filename}`,
      },
    });
    response.code(201);
    return response;
  }

  async getJobdeskHandler(request, h) {
    this._validator.validateGetJobdesks(request.params);

    const id = request.auth.credentials.id;
    const user = await this._usersService.getUserById(id);
    const unit_id = user[0].unit_id;
    const division_id = user[0].division_id;
    const validUnitId = unit_id != null ? unit_id : "";
    const validDivisionId = division_id != null ? division_id : "";
    const data = await this._jobdeskService.getJobdesks(
      validDivisionId,
      validUnitId,
      id
    );
    return {
      status: "success",
      data,
    };
  }
}

module.exports = JobdeskHandler;
