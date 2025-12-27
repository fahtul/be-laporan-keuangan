const InvariantError = require("../../../exceptions/InvariantError");
const { EquityStatementQuerySchema } = require("./schema");

module.exports = {
  validateQuery(query) {
    const { error } = EquityStatementQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

