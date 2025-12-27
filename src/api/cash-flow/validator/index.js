const InvariantError = require("../../../exceptions/InvariantError");
const { CashFlowQuerySchema } = require("./schema");

module.exports = {
  validateQuery(query) {
    const { error } = CashFlowQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

