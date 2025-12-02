const Joi = require("joi");

const JobdeskCollaborationsPayloadSchema = Joi.object({
  jobdeskId: Joi.string().required(),
  unitId: Joi.string().allow("", null).optional(),
  divisionId: Joi.string().allow("", null).optional(),
  userId: Joi.array().items(Joi.string()), // userId is an array of strings
});

module.exports = { JobdeskCollaborationsPayloadSchema };
