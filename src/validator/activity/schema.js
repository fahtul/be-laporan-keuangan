const Joi = require("joi");

const ActivityPayloadSchema = Joi.object({
  activity_name: Joi.string().required(),
});

module.exports = ActivityPayloadSchema;
