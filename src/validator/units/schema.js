const Joi = require("joi");

const UnitPayloadSchema = Joi.object({
  name: Joi.string().required(),
  divisionId: Joi.string().required(),
});

module.exports = UnitPayloadSchema;
