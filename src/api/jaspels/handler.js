const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");

class JaspelHandler {
  constructor(
    jaspelService,
    storageService,
    unitService,
    divisionService,
    usersService,
    jaspelCollaborationService,
    validator
  ) {
    this._jaspelService = jaspelService;
    this._storageService = storageService;
    this._unitService = unitService;
    this._divisionService = divisionService;
    this._usersService = usersService;
    this._jaspelCollaborationService = jaspelCollaborationService;
    this._validator = validator;

    autoBind(this);
  }
  async postJaspelWithFileHandler(request, h) {
    try {
      const { jaspelFile } = request.payload;
      this._validator.validateJaspelFile(jaspelFile.hapi.headers);
      this._validator.validateJaspelPayload(request.payload);
  
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
        jaspelFile,
        jaspelFile.hapi
      );
      const id = await this._jaspelService.addJaspel(
        credentialId,
        unitId,
        divisionId,
        title,
        description,
        filename
      );
  
      await this._jaspelCollaborationService.addJaspelCollaborationByUser(id, [
        credentialId,
      ]);
  
      const response = h.response({
        status: "success",
        message: "Jaspel berhasil diunggah",
        data: {
          fileLocation: `${filename}`,
        },
      });
      response.code(201);
      return response; 
    } catch (error) {
      console.error(error);
    }
  }

  async getJaspelHandler(request, h) {
    this._validator.validateGetJaspels(request.params);

    const id = request.auth.credentials.id;
    const user = await this._usersService.getUserById(id);
    const unit_id = user[0].unit_id;
    const division_id = user[0].division_id;
    const validUnitId = unit_id != null ? unit_id : "";
    const validDivisionId = division_id != null ? division_id : "";
    const data = await this._jaspelService.getJaspels(
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

module.exports = JaspelHandler;
