const InvariantError = require("../../exceptions/InvariantError");
const { DocumentCollaborationsPayloadSchema } = require("./schema");

const DocumentCollaborationsValidator = {
  validateDocumentCollaborationPayload: (payload) => {
    const validationResult =
      DocumentCollaborationsPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = DocumentCollaborationsValidator;
