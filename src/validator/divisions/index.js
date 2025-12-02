const DivisionPayloadSchema = require("./schema");
const InvariantError = require("../../exceptions/InvariantError");

const DivisionsValidator = {
  validateDivisionPayload: (payload) => {
    const validationResult = DivisionPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = DivisionsValidator;
