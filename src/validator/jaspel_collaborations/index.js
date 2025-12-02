const InvariantError = require("../../exceptions/InvariantError");
const { JaspelCollaborationsPayloadSchema } = require("./schema");

const JaspelCollaborationsValidator = {
  validateJaspelCollaborationPayload: (payload) => {
    const validationResult =
      JaspelCollaborationsPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = JaspelCollaborationsValidator;
