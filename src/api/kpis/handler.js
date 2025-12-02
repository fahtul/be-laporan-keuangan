const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");

class KpiHandler {
  constructor(
    kpiService,
    storageService,
    unitService,
    divisionService,
    usersService,
    kpiCollaborationService,
    validator
  ) {
    this._kpiService = kpiService;
    this._storageService = storageService;
    this._unitService = unitService;
    this._divisionService = divisionService;
    this._usersService = usersService;
    this._kpiCollaborationService = kpiCollaborationService;
    this._validator = validator;

    autoBind(this);
  }
  async postKpiWithFileHandler(request, h) {
    try {
      const { kpiFile } = request.payload;
      this._validator.validateKpiFile(kpiFile.hapi.headers);
      this._validator.validateKpiPayload(request.payload);
  
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
        kpiFile,
        kpiFile.hapi
      );
      const id = await this._kpiService.addKpi(
        credentialId,
        unitId,
        divisionId,
        title,
        description,
        filename
      );
  
      await this._kpiCollaborationService.addKpiCollaborationByUser(id, [
        credentialId,
      ]);
  
      const response = h.response({
        status: "success",
        message: "Kpi berhasil diunggah",
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

  async getKpiHandler(request, h) {
    this._validator.validateGetKpis(request.params);

    const id = request.auth.credentials.id;
    const user = await this._usersService.getUserById(id);
    const unit_id = user[0].unit_id;
    const division_id = user[0].division_id;
    const validUnitId = unit_id != null ? unit_id : "";
    const validDivisionId = division_id != null ? division_id : "";
    const data = await this._kpiService.getKpis(
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

module.exports = KpiHandler;
