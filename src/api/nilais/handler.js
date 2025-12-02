const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");

class NilaiHandler {
  constructor(
    nilaiService,
    storageService,
    unitService,
    divisionService,
    usersService,
    nilaiCollaborationService,
    validator
  ) {
    this._nilaiService = nilaiService;
    this._storageService = storageService;
    this._unitService = unitService;
    this._divisionService = divisionService;
    this._usersService = usersService;
    this._nilaiCollaborationService = nilaiCollaborationService;
    this._validator = validator;

    autoBind(this);
  }
  async postNilaiWithFileHandler(request, h) {
    try {
      const { nilaiFile } = request.payload;
      this._validator.validateNilaiFile(nilaiFile.hapi.headers);
      this._validator.validateNilaiPayload(request.payload);
  
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
        nilaiFile,
        nilaiFile.hapi
      );
      const id = await this._nilaiService.addNilai(
        credentialId,
        unitId,
        divisionId,
        title,
        description,
        filename
      );
  
      await this._nilaiCollaborationService.addNilaiCollaborationByUser(id, [
        credentialId,
      ]);
  
      const response = h.response({
        status: "success",
        message: "Nilai berhasil diunggah",
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

  async getNilaiHandler(request, h) {
    this._validator.validateGetNilais(request.params);

    const id = request.auth.credentials.id;
    const user = await this._usersService.getUserById(id);
    const unit_id = user[0].unit_id;
    const division_id = user[0].division_id;
    const validUnitId = unit_id != null ? unit_id : "";
    const validDivisionId = division_id != null ? division_id : "";
    const data = await this._nilaiService.getNilais(
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

module.exports = NilaiHandler;
