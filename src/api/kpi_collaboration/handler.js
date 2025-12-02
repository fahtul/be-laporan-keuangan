const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class KpiCollaborationHandler {
  constructor(
    kpiService,
    kpiCollaborationService,
    userService,
    divisionService,
    unitService,
    validator
  ) {
    this._kpiService = kpiService;
    this._kpiCollaborationService = kpiCollaborationService;
    this._userService = userService;
    this._divisionService = divisionService;
    this._unitService = unitService;
    this._validator = validator;

    autoBind(this);
  }
  async postKpiCollaborationHandler(request, h) {
    this._validator.validateKpiCollaborationPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { kpiId, unitId, divisionId, userId } = request.payload;

    const addCollaboration = async () => {
      if (divisionId !== "" && divisionId !== undefined) {
        console.log(`divisionId inserted into`);
        // await this._divisionService.getDivisionById(divisionId);
        await this._kpiCollaborationService.checkKpiIdWithDivisionIsNotExists(
          kpiId,
          divisionId
        );
        await this._kpiCollaborationService.addKpiCollaborationByDivision(
          kpiId,
          divisionId
        );
      } else if (unitId !== "" && unitId !== undefined) {
        console.log(`unitId inserted into`);
        // await this._unitService.getUnitById(unitId);
        await this._kpiCollaborationService.checkUnitIdIsNotExists(
          kpiId,
          unitId
        );
        await this._kpiCollaborationService.addKpiCollaborationByUnit(
          kpiId,
          unitId
        );
      } else {
        if (!Array.isArray(userId)) {
          throw new InvariantError("userId must be an array");
        }
        await this._kpiCollaborationService.checkUserIdIsNotExists(
          kpiId,
          userId
        );
        await this._kpiCollaborationService.addKpiCollaborationByUser(
          kpiId,
          userId
        );
      }
    };

    try {
      console.log(`is divisionId undefined ${divisionId === undefined}`);
      if (divisionId !== "" && divisionId !== undefined) {
        console.log("ERROR6");
        await this._divisionService.getDivisionById(divisionId);
      } else if (unitId !== "" && unitId !== undefined) {
        console.log("ERROR5");
        await this._unitService.getUnitById(unitId);
      } else {
        await this._userService.getUsersByIds(userId);
      }
      await this._kpiService.getKpiById(kpiId);
      console.log("ERROR4");
      try {
        await this._userService.getIsUserAdmin(credentialId);
        await addCollaboration();
        console.log("ERROR7");
      } catch (error) {
        console.log("ERROR10");
        try {
          await this._kpiService.getUserIsKpiOwner(
            kpiId,
            credentialId
          );
          await addCollaboration();
          console.log("ERROR9");
        } catch (error) {
          throw new InvariantError(error.message);
        }
      }
    } catch (error) {
      console.log("cekerror2 ", error.message);
      throw new InvariantError(error.message);
    }
    return h
      .response({
        status: "success",
        message: "Kpi Collaboration berhasil ditambahkan",
      })
      .code(201);
  }
}

module.exports = KpiCollaborationHandler;
