const Joi = require("joi");

const YearSchema = Joi.string().pattern(/^\d{4}$/).required();
const YmdSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

const ClosingStatusQuerySchema = Joi.object({
  year: YearSchema,
});

const RunYearEndClosingSchema = Joi.object({
  year: YearSchema,
  date: YmdSchema.optional(),
  memo: Joi.string().allow("", null).max(2000).optional(),
  retained_earnings_account_id: Joi.string().uuid().required(),
  generate_opening: Joi.boolean().truthy("1").falsy("0").optional(),
});

module.exports = { ClosingStatusQuerySchema, RunYearEndClosingSchema };

