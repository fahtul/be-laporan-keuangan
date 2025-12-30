const InvariantError = require("../../../exceptions/InvariantError");
const {
  ClosingStatusQuerySchema,
  RunYearEndClosingSchema,
} = require("./schema");

module.exports = {
  validateStatusQuery(query) {
    const { value, error } = ClosingStatusQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },

  validateRunPayload(payload) {
    const { value, error } = RunYearEndClosingSchema.validate(payload, {
      abortEarly: true,
      allowUnknown: false,
      convert: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
    return value;
  },
};
