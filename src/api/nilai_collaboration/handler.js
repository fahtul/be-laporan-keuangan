const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class NilaiCollaborationHandler {
  constructor(
    nilaiService,
    nilaiCollaborationService,
    userService,
    divisionService,
    unitService,
    validator
  ) {
    this._nilaiService = nilaiService;
    this._nilaiCollaborationService = nilaiCollaborationService;
    this._userService = userService;
    this._divisionService = divisionService;
    this._unitService = unitService;
    this._validator = validator;

    autoBind(this);
  }
  async postNilaiCollaborationHandler(request, h) {
    this._validator.validateNilaiCollaborationPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { nilaiId, unitId, divisionId, userId } = request.payload;

    const addCollaboration = async () => {
      if (divisionId !== "" && divisionId !== undefined) {
        console.log(`divisionId inserted into`);
        // await this._divisionService.getDivisionById(divisionId);
        await this._nilaiCollaborationService.checkNilaiIdWithDivisionIsNotExists(
          nilaiId,
          divisionId
        );
        await this._nilaiCollaborationService.addNilaiCollaborationByDivision(
          nilaiId,
          divisionId
        );
      } else if (unitId !== "" && unitId !== undefined) {
        console.log(`unitId inserted into`);
        // await this._unitService.getUnitById(unitId);
        await this._nilaiCollaborationService.checkUnitIdIsNotExists(
          nilaiId,
          unitId
        );
        await this._nilaiCollaborationService.addNilaiCollaborationByUnit(
          nilaiId,
          unitId
        );
      } else {
        if (!Array.isArray(userId)) {
          throw new InvariantError("userId must be an array");
        }
        await this._nilaiCollaborationService.checkUserIdIsNotExists(
          nilaiId,
          userId
        );
        await this._nilaiCollaborationService.addNilaiCollaborationByUser(
          nilaiId,
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
      await this._nilaiService.getNilaiById(nilaiId);
      console.log("ERROR4");
      try {
        await this._userService.getIsUserAdmin(credentialId);
        await addCollaboration();
        console.log("ERROR7");
      } catch (error) {
        console.log("ERROR10");
        try {
          await this._nilaiService.getUserIsNilaiOwner(
            nilaiId,
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
        message: "Nilai Collaboration berhasil ditambahkan",
      })
      .code(201);
  }
}

module.exports = NilaiCollaborationHandler;
