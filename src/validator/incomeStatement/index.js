const InvariantError = require("../../exceptions/InvariantError");
const { IncomeStatementQuerySchema } = require("./schema");

module.exports = {
  validateQuery(query) {
    const { error } = IncomeStatementQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};
