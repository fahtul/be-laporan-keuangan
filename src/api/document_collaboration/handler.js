const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class DocumentCollaborationHandler {
  constructor(
    documentService,
    documentCollaborationService,
    userService,
    divisionService,
    unitService,
    validator
  ) {
    this._documentService = documentService;
    this._documentCollaborationService = documentCollaborationService;
    this._userService = userService;
    this._divisionService = divisionService;
    this._unitService = unitService;
    this._validator = validator;

    autoBind(this);
  }
  async postDocumentCollaborationHandler(request, h) {
    this._validator.validateDocumentCollaborationPayload(request.payload);

    const { id: credentialId } = request.auth.credentials;
    const { documentId, unitId, divisionId, userId } = request.payload;

    const addCollaboration = async () => {
      if (divisionId !== "" && divisionId !== undefined) {
        console.log(`divisionId inserted into`);
        // await this._divisionService.getDivisionById(divisionId);
        await this._documentCollaborationService.checkDocumentIdWithDivisionIsNotExists(
          documentId,
          divisionId
        );
        await this._documentCollaborationService.addDocumentCollaborationByDivision(
          documentId,
          divisionId
        );
      } else if (unitId !== "" && unitId !== undefined) {
        console.log(`unitId inserted into`);
        // await this._unitService.getUnitById(unitId);
        await this._documentCollaborationService.checkUnitIdIsNotExists(
          documentId,
          unitId
        );
        await this._documentCollaborationService.addDocumentCollaborationByUnit(
          documentId,
          unitId
        );
      } else {
        if (!Array.isArray(userId)) {
          throw new InvariantError("userId must be an array");
        }
        await this._documentCollaborationService.checkUserIdIsNotExists(
          documentId,
          userId
        );
        await this._documentCollaborationService.addDocumentCollaborationByUser(
          documentId,
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
      await this._documentService.getDocumentById(documentId);
      console.log("ERROR4");
      try {
        await this._userService.getIsUserAdmin(credentialId);
        await addCollaboration();
        console.log("ERROR7");
      } catch (error) {
        console.log("ERROR10");
        try {
          await this._documentService.getUserIsDocumentOwner(
            documentId,
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
        message: "Document Collaboration berhasil ditambahkan",
      })
      .code(201);
  }
}

module.exports = DocumentCollaborationHandler;
