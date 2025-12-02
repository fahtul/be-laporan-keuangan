const Joi = require("joi");

const DivisionPayloadSchema = Joi.object({
  name: Joi.string().required(),
});

module.exports = DivisionPayloadSchema;
