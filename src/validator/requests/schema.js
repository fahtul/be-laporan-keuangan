// src/validator/requests/schema.js
const Joi = require("joi");

// a single Hapi file‐object schema
const FileSchema = Joi.object({
  hapi: Joi.object({
    headers: Joi.object().required(),
  })
    .unknown(true) // allow filename, etc.
    .required(),
  _data: Joi.any().required(),
})
  .unknown(true) // allow other stream props
  .required();

const RequestPayloadSchema = Joi.object({
  type: Joi.string()
    .valid(
      "overtime",
      "time_off",
      "shift_change",
      "manual_attendance",
      "sick",
      "late_attendance"
    )
    .required(),
  reason: Joi.string().allow("", null),
  request_date: Joi.date().required(),
  request_end_date: Joi.date().when("type", {
    is: Joi.valid("time_off", "manual_attendance", "sick"),
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  start_time: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .allow(null, ""),
  end_time: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .allow(null, ""),
  shift_id: Joi.string().allow("", null),

  // Accept *either* a single FileSchema *or* an array of them
  evidence_photos: Joi.alternatives()
    .try(FileSchema, Joi.array().items(FileSchema).min(1))
    .required(),
});

const ApprovalPayloadSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected").required(),
  note: Joi.string().allow("", null),
});

module.exports = {
  RequestPayloadSchema,
  ApprovalPayloadSchema,
};
