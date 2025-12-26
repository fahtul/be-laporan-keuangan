const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateBusinessPartnerSchema,
  UpdateBusinessPartnerSchema,
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
};
