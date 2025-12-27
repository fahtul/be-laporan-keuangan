const InvariantError = require("../../../exceptions/InvariantError");
const { ClosingStatusQuerySchema, RunYearEndClosingSchema } = require("./schema");

module.exports = {
  validateStatusQuery(query) {
    const { error } = ClosingStatusQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },

  validateRunPayload(payload) {
    const { error } = RunYearEndClosingSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

