const InvariantError = require("../../exceptions/InvariantError");
const {
  UserPayloadSchema,
  UpdateUserPayloadSchema,
  UpdateUserPasswordPayloadSchema,
  DeleteUserIdSchema,
  GetUsersPaginationSchema,
  ImportUserSalarySchema,
} = require("./schema");

const UserValidator = {
  validateUserPayload: (payload) => {
    const validationResult = UserPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateUpdateUserPayload: (payload) => {
    const validationResult = UpdateUserPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateUpdateUserPasswordPayload: (payload) => {
    const validationResult = UpdateUserPasswordPayloadSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateDeleteUserId: (request, h) => {
    const validationResult = DeleteUserIdSchema.validate(request.params);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateGetUsers: (request, h) => {
    const validationResult = GetUsersPaginationSchema.validate(request.params);
    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateImportUserSalary: (payload) => {
    const validationResult = ImportUserSalarySchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UserValidator;
