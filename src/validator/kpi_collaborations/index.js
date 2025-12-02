const InvariantError = require("../../exceptions/InvariantError");
const { KpiCollaborationsPayloadSchema } = require("./schema");

const KpiCollaborationsValidator = {
  validateKpiCollaborationPayload: (payload) => {
    const validationResult =
      KpiCollaborationsPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = KpiCollaborationsValidator;
