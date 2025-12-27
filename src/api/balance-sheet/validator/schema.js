const Joi = require("joi");

const YmdSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .required()
  .custom((value, helpers) => {
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return helpers.message("as_of is invalid");
    return value;
  }, "as_of date validation");

const YearSchema = Joi.string().pattern(/^\d{4}$/).optional();

const BalanceSheetQuerySchema = Joi.object({
  as_of: YmdSchema,
  year: YearSchema,
  include_zero: Joi.boolean().truthy("1").falsy("0").optional(),
  include_header: Joi.boolean().truthy("1").falsy("0").optional(),
  profit_basis: Joi.string().valid("after_tax", "operating", "net").optional(),
});

module.exports = { BalanceSheetQuerySchema };

