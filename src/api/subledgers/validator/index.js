const InvariantError = require("../../../exceptions/InvariantError");
const {
  ListQuerySchema,
  DetailParamsSchema,
  DetailQuerySchema,
} = require("./schema");

module.exports = {
  validateListQuery(query) {
    const { error } = ListQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },

  validateDetailParams(params) {
    const { error } = DetailParamsSchema.validate(params, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },

  validateDetailQuery(query) {
    const { error } = DetailQuerySchema.validate(query, {
      abortEarly: true,
      allowUnknown: true,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};

