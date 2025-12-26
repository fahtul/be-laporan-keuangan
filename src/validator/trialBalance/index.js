const InvariantError = require("../../exceptions/InvariantError");
const { TrialBalanceQuerySchema } = require("./schema");

module.exports = {
  validateQuery(query) {
    const { error } = TrialBalanceQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

