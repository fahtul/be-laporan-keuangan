const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateBusinessPartnerSchema,
  UpdateBusinessPartnerSchema,
  ImportBusinessPartnersSchema,
} = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { error } = CreateBusinessPartnerSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateUpdate(payload) {
    const { error } = UpdateBusinessPartnerSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateImport(payload) {
    const { error } = ImportBusinessPartnersSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};
