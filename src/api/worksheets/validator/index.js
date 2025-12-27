const InvariantError = require("../../../exceptions/InvariantError");
const { WorksheetsQuerySchema } = require("./schema");

module.exports = {
  validateQuery(query) {
    const { error } = WorksheetsQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

