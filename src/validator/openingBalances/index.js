const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateOpeningBalanceSchema,
  UpdateOpeningBalanceSchema,
  OpeningBalanceIdParamsSchema,
} = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { value, error } = CreateOpeningBalanceSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },

  validateUpdate(payload) {
    const { value, error } = UpdateOpeningBalanceSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },

  validateIdParams(params) {
    const { value, error } = OpeningBalanceIdParamsSchema.validate(params, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },
};
