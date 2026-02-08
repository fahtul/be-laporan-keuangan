const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateAccountSchema,
  UpdateAccountSchema,
  ImportAccountsSchema,
} = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { value, error } = CreateAccountSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },
  validateUpdate(payload) {
    const { value, error } = UpdateAccountSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
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
