const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateAccountSchema,
  UpdateAccountSchema,
  ImportAccountsSchema,
} = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { error } = CreateAccountSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateUpdate(payload) {
    const { error } = UpdateAccountSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateImport(payload) {
    const { value, error } = ImportAccountsSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },
};
