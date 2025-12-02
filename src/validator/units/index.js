const UnitPayloadSchema = require("./schema");
const InvariantError = require("../../exceptions/InvariantError");

const UnitsValidator = {
  validateUnitPayload: (payload) => {
    const validationResult = UnitPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UnitsValidator;
