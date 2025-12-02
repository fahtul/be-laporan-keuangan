const Joi = require("joi");

// Common numeric rules
const nonNeg = Joi.number().min(0).required();

const CreateSalaryRuleSchema = Joi.object({
  userId: Joi.string().required(),
  base_monthly_salary: nonNeg,
  deduction_per_minute_late: nonNeg,
  deduction_per_minute_early: nonNeg,
});

const UpdateSalaryRuleSchema = Joi.object({
  base_monthly_salary: nonNeg,
  deduction_per_minute_late: nonNeg,
  deduction_per_minute_early: nonNeg,
});

module.exports = {
  CreateSalaryRuleSchema,
  UpdateSalaryRuleSchema,
};
