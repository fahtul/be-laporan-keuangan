const Joi = require("joi");

// schema untuk body checkin/checkout
const AttendancePayloadSchema = Joi.object({
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
});

// schema untuk query GET /attendances
const GetAttendancesQuerySchema = Joi.object({
  month: Joi.string()
    .pattern(/^\d{4}-\d{2}$/, "YYYY-MM")
    .required(),
  userId: Joi.string().optional(),
});

// NEW: manual edit schema (admin)
const ManualTimesPayloadSchema = Joi.object({
  userId: Joi.string().required(),
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .required(),
  clockIn: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .allow("", null), // HH:mm
  clockOut: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .allow("", null), // HH:mm
  source: Joi.string().default("manual_edit"),
  editedBy: Joi.string().default("self"), // siapa yang edit
});

module.exports = {
  AttendancePayloadSchema,
  GetAttendancesQuerySchema,
  ManualTimesPayloadSchema,
};
