const InvariantError = require("../../../exceptions/InvariantError");
const { BalanceSheetQuerySchema } = require("./schema");

module.exports = {
  validateQuery(query) {
    const { error } = BalanceSheetQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

