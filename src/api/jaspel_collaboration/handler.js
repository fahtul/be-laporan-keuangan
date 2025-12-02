const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class JaspelCollaborationHandler {
  constructor(
    jaspelService,
    jaspelCollaborationService,
    userService,
    divisionService,
    unitService,
    validator
  ) {
    this._jaspelService = jaspelService;
    this._jaspelCollaborationService = jaspelCollaborationService;
    this._userService = userService;
    this._divisionService = divisionService;
    this._unitService = unitService;
    this._validator = validator;

    autoBind(this);
  }
  async postJaspelCollaborationHandler(request, h) {
    this._validator.validateJaspelCollaborationPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { jaspelId, unitId, divisionId, userId } = request.payload;

    const addCollaboration = async () => {
      if (divisionId !== "" && divisionId !== undefined) {
        console.log(`divisionId inserted into`);
        // await this._divisionService.getDivisionById(divisionId);
        await this._jaspelCollaborationService.checkJaspelIdWithDivisionIsNotExists(
          jaspelId,
          divisionId
        );
        await this._jaspelCollaborationService.addJaspelCollaborationByDivision(
          jaspelId,
          divisionId
        );
      } else if (unitId !== "" && unitId !== undefined) {
        console.log(`unitId inserted into`);
        // await this._unitService.getUnitById(unitId);
        await this._jaspelCollaborationService.checkUnitIdIsNotExists(
          jaspelId,
          unitId
        );
        await this._jaspelCollaborationService.addJaspelCollaborationByUnit(
          jaspelId,
          unitId
        );
      } else {
        if (!Array.isArray(userId)) {
          throw new InvariantError("userId must be an array");
        }
        await this._jaspelCollaborationService.checkUserIdIsNotExists(
          jaspelId,
          userId
        );
        await this._jaspelCollaborationService.addJaspelCollaborationByUser(
          jaspelId,
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
      await this._jaspelService.getJaspelById(jaspelId);
      console.log("ERROR4");
      try {
        await this._userService.getIsUserAdmin(credentialId);
        await addCollaboration();
        console.log("ERROR7");
      } catch (error) {
        console.log("ERROR10");
        try {
          await this._jaspelService.getUserIsJaspelOwner(
            jaspelId,
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
        message: "Jaspel Collaboration berhasil ditambahkan",
      })
      .code(201);
  }
}

module.exports = JaspelCollaborationHandler;
