const InvariantError = require("../../exceptions/InvariantError");
const { CreateAccountSchema, UpdateAccountSchema } = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { error } = CreateAccountSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateUpdate(payload) {
    const { error } = UpdateAccountSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
};
