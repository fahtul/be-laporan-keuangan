const InvariantError = require("../../exceptions/InvariantError");
const { JobdeskCollaborationsPayloadSchema } = require("./schema");

const JobdeskCollaborationsValidator = {
  validateJobdeskCollaborationPayload: (payload) => {
    const validationResult =
      JobdeskCollaborationsPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = JobdeskCollaborationsValidator;
