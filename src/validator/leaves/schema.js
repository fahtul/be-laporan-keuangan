// src/api/leaves/schema.js
const Joi = require("joi");

const CreateLeaveSchema = Joi.object({
  // accept both holiday|cuti  and sick|sakit
  type: Joi.string().valid("holiday", "sick", "cuti", "sakit").required(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")).required(),
  reason: Joi.string().allow("").max(500),
});

const ApproveLeaveSchema = Joi.object({
  id: Joi.number().integer().required(),
});

module.exports = { CreateLeaveSchema, ApproveLeaveSchema };
