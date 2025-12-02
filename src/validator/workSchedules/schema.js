const Joi = require("joi");

// pola untuk HH:mm
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
// pola untuk YYYY-MM
const yearMonthPattern = /^\d{4}-\d{2}$/;
// pola untuk YYYY-MM-DD
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// Weekdays array 0=Sunday…6=Saturday
const weekdaysArray = Joi.array()
  .items(Joi.number().integer().min(0).max(6))
  .unique()
  .min(1) // at least one day
  .max(7) // at most seven days
  .optional();

const CreateWorkScheduleSchema = Joi.object({
  userId: Joi.string().required(),
  expected_checkin: Joi.string().pattern(timePattern, "HH:mm").required(),
  expected_checkout: Joi.string().pattern(timePattern, "HH:mm").required(),
});

const UpdateWorkScheduleSchema = Joi.object({
  expected_checkin: Joi.string().pattern(timePattern, "HH:mm").required(),
  expected_checkout: Joi.string().pattern(timePattern, "HH:mm").required(),
});

const BulkOverrideSchema = Joi.object({
  yearMonth: Joi.string().pattern(yearMonthPattern, "YYYY-MM").required(),
  overrides: Joi.array()
    .items(
      Joi.object({
        date: Joi.string().pattern(datePattern, "YYYY-MM-DD").required(),
        expected_checkin: Joi.string().pattern(timePattern, "HH:mm").required(),
        expected_checkout: Joi.string()
          .pattern(timePattern, "HH:mm")
          .required(),
      })
    )
    .min(1)
    .required(),
});

module.exports = {
  CreateWorkScheduleSchema,
  UpdateWorkScheduleSchema,
  BulkOverrideSchema,
};
