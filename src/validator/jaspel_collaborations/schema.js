const Joi = require("joi");

const JaspelCollaborationsPayloadSchema = Joi.object({
  jaspelId: Joi.string().required(),
  unitId: Joi.string().allow("", null).optional(),
  divisionId: Joi.string().allow("", null).optional(),
  userId: Joi.array().items(Joi.string()), // userId is an array of strings
});

module.exports = { JaspelCollaborationsPayloadSchema };
