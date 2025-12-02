const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class JobdeskCollaborationHandler {
  constructor(
    jobdeskService,
    jobdeskCollaborationService,
    userService,
    divisionService,
    unitService,
    validator
  ) {
    this._jobdeskService = jobdeskService;
    this._jobdeskCollaborationService = jobdeskCollaborationService;
    this._userService = userService;
    this._divisionService = divisionService;
    this._unitService = unitService;
    this._validator = validator;

    autoBind(this);
  }
  async postJobdeskCollaborationHandler(request, h) {
    this._validator.validateJobdeskCollaborationPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { jobdeskId, unitId, divisionId, userId } = request.payload;

    const addCollaboration = async () => {
      if (divisionId !== "" && divisionId !== undefined) {
        console.log(`divisionId inserted into`);
        // await this._divisionService.getDivisionById(divisionId);
        await this._jobdeskCollaborationService.checkJobdeskIdWithDivisionIsNotExists(
          jobdeskId,
          divisionId
        );
        await this._jobdeskCollaborationService.addJobdeskCollaborationByDivision(
          jobdeskId,
          divisionId
        );
      } else if (unitId !== "" && unitId !== undefined) {
        console.log(`unitId inserted into`);
        // await this._unitService.getUnitById(unitId);
        await this._jobdeskCollaborationService.checkUnitIdIsNotExists(
          jobdeskId,
          unitId
        );
        await this._jobdeskCollaborationService.addJobdeskCollaborationByUnit(
          jobdeskId,
          unitId
        );
      } else {
        if (!Array.isArray(userId)) {
          throw new InvariantError("userId must be an array");
        }
        await this._jobdeskCollaborationService.checkUserIdIsNotExists(
          jobdeskId,
          userId
        );
        await this._jobdeskCollaborationService.addJobdeskCollaborationByUser(
          jobdeskId,
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
      await this._jobdeskService.getJobdeskById(jobdeskId);
      console.log("ERROR4");
      try {
        await this._userService.getIsUserAdmin(credentialId);
        await addCollaboration();
        console.log("ERROR7");
      } catch (error) {
        console.log("ERROR10");
        try {
          await this._jobdeskService.getUserIsJobdeskOwner(
            jobdeskId,
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
        message: "Jobdesk Collaboration berhasil ditambahkan",
      })
      .code(201);
  }
}

module.exports = JobdeskCollaborationHandler;
