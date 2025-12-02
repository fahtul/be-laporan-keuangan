const InvariantError = require("../../exceptions/InvariantError");
const { NilaiCollaborationsPayloadSchema } = require("./schema");

const NilaiCollaborationsValidator = {
  validateNilaiCollaborationPayload: (payload) => {
    const validationResult =
      NilaiCollaborationsPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = NilaiCollaborationsValidator;
