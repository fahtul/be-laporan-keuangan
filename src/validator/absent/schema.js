const Joi = require("joi");

const AbsentPayloadSchema = Joi.object({
  activity_id: Joi.string().required(),
  description: Joi.string().required(),
});

module.exports = AbsentPayloadSchema;
