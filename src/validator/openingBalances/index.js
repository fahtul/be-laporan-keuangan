const InvariantError = require("../../exceptions/InvariantError");
const { CreateOpeningBalanceSchema } = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { error } = CreateOpeningBalanceSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};
