const Joi = require("joi");

const YmdSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .required();

const ListQuerySchema = Joi.object({
  from_date: YmdSchema,
  to_date: YmdSchema,
  account_id: Joi.string().uuid().required(),
  q: Joi.string().allow("").optional(),
  include_zero: Joi.boolean().truthy("1").falsy("0").optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50).optional(),
}).custom((value, helpers) => {
  if (value.from_date > value.to_date) {
    return helpers.message("from_date must be <= to_date");
  }
  return value;
}, "date range validation");

const DetailParamsSchema = Joi.object({
  bpId: Joi.string().uuid().required(),
});

const DetailQuerySchema = Joi.object({
  from_date: YmdSchema,
  to_date: YmdSchema,
  account_id: Joi.string().uuid().required(),
}).custom((value, helpers) => {
  if (value.from_date > value.to_date) {
    return helpers.message("from_date must be <= to_date");
  }
  return value;
}, "date range validation");

module.exports = { ListQuerySchema, DetailParamsSchema, DetailQuerySchema };

