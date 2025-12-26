const InvariantError = require("../../exceptions/InvariantError");
const { GetLedgerSchema } = require("./schema");

module.exports = {
  validateGet(payload) {
    const { error } = GetLedgerSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};
