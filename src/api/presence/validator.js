const Joi = require("joi");

const SORTABLE_FIELDS = [
  // common
  "date",
  "users_count",
  // user group
  "fullname",
  "user_id",
  "excused_days",
  "izin_days",
  "cuti_days",
  "sakit_days",
  "alfa_days",
  "late_count",
  "late_minutes_total",
  "late_nominal_total",
  "early_count",
  "early_minutes_total",
  "early_nominal_total",
  "deduction_total",
];

const sharedRangeSchema = Joi.object({
  year: Joi.number().integer().min(2000),
  month: Joi.number().integer().min(1).max(12),
  from_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  to_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  group: Joi.string().valid("user", "day").default("user"),
  sort_by: Joi.string().valid(...SORTABLE_FIELDS),
  sort_dir: Joi.string().valid("asc", "desc").default("asc"),
}).custom((value, helpers) => {
  const hasYM = value.year && value.month;
  const hasRange = value.from_date && value.to_date;
  if (!hasYM && !hasRange) {
    return helpers.error("any.custom", {
      message: "Provide (year & month) or (from_date & to_date).",
    });
  }
  return value;
}, "YM or date range");

class PresenceValidator {
  validateMonthlySummaryQuery(q) {
    const { error } = sharedRangeSchema.validate(q);
    if (error) throw error;
  }
  validateUserDetailQuery(q) {
    const { error } = sharedRangeSchema
      .keys({ userId: Joi.string().required() })
      .validate(q);
    if (error) throw error;
  }
}

module.exports = PresenceValidator;
