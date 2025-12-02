// src/api/late/validator.js
const Joi = require("joi");

class LateValidator {
  validateMonthlyLateQuery(q) {
    const schema = Joi.object({
      year: Joi.number().integer().min(2000).required(),
      month: Joi.number().integer().min(1).max(12).required(),
      status: Joi.string().valid("draft", "locked", "approved", "published"),
      group: Joi.string().valid("user", "day").default("user"),
      sort_by: Joi.string().valid(
        "fullname",
        "date",
        "late_count",
        "late_minutes_total",
        "late_nominal_total",
        "deduction_total"
      ),
      sort_dir: Joi.string().valid("asc", "desc").default("asc"),
    });
    const { error } = schema.validate(q);
    if (error) throw error;
  }
}

module.exports = LateValidator;
