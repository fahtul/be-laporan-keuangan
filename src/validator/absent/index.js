const AbsentPayloadSchema = require("./schema");
const InvariantError = require("../../exceptions/InvariantError");

const AbsentValidator = {
  validateAbsentPayload: (payload) => {
    const validationResult = AbsentPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = AbsentValidator;
