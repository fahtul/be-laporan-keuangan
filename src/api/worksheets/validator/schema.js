const Joi = require("joi");

const YmdSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .required();

const WorksheetsQuerySchema = Joi.object({
  from_date: YmdSchema,
  to_date: YmdSchema,
  include_zero: Joi.boolean().truthy("1").falsy("0").optional(),
  include_header: Joi.boolean().truthy("1").falsy("0").optional(),
  use_code_rule: Joi.boolean().truthy("1").falsy("0").optional(),
  include_virtual_profit: Joi.boolean().truthy("1").falsy("0").optional(),
}).custom((value, helpers) => {
  if (value.from_date > value.to_date) {
    return helpers.message("from_date must be <= to_date");
  }
  return value;
}, "date range validation");

module.exports = { WorksheetsQuerySchema };

