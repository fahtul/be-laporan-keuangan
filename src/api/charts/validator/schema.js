const Joi = require("joi");

const YmdSchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .required();

const IntervalSchema = Joi.string().valid("month", "quarter").default("month");

const DateRangeSchema = Joi.object({
  from_date: YmdSchema,
  to_date: YmdSchema,
  interval: IntervalSchema,
}).custom((value, helpers) => {
  if (value.from_date > value.to_date) {
    return helpers.message("from_date must be <= to_date");
  }
  return value;
}, "date range validation");

const Bool01Schema = Joi.boolean().truthy("1").falsy("0");

const IncomeStatementChartQuerySchema = DateRangeSchema.keys({
  include_zero: Bool01Schema.optional(),
  include_header: Bool01Schema.optional(),
  tax_rate: Joi.number().min(0).max(1).optional().allow(null),
  grouping: Joi.string().valid("excel", "simple").optional(),
});

const BalanceSheetChartQuerySchema = DateRangeSchema.keys({
  include_zero: Bool01Schema.optional(),
  include_header: Bool01Schema.optional(),
  profit_basis: Joi.string().valid("after_tax", "operating", "net").optional(),
});

const EquityStatementChartQuerySchema = DateRangeSchema.keys({
  include_zero: Bool01Schema.optional(),
  include_header: Bool01Schema.optional(),
  use_code_rule: Bool01Schema.optional(),
  include_virtual_profit: Bool01Schema.optional(),
  profit_mode: Joi.string().valid("net", "after_tax").optional(),
});

const CashFlowChartQuerySchema = DateRangeSchema.keys({
  include_zero: Bool01Schema.optional(),
  include_details: Bool01Schema.optional(),
  cash_account_ids: Joi.alternatives()
    .try(Joi.array().items(Joi.string().uuid()), Joi.string().uuid())
    .optional(),
  cash_prefix: Joi.string().max(10).optional(),
});

const FinancialsQuerySchema = DateRangeSchema.keys({
  // shared toggles
  include_zero: Bool01Schema.optional(),
  include_header: Bool01Schema.optional(),

  // income statement
  tax_rate: Joi.number().min(0).max(1).optional().allow(null),
  grouping: Joi.string().valid("excel", "simple").optional(),

  // balance sheet
  profit_basis: Joi.string().valid("after_tax", "operating", "net").optional(),

  // equity statement
  use_code_rule: Bool01Schema.optional(),
  include_virtual_profit: Bool01Schema.optional(),
  profit_mode: Joi.string().valid("net", "after_tax").optional(),

  // cash flow
  include_details: Bool01Schema.optional(),
  cash_account_ids: Joi.alternatives()
    .try(Joi.array().items(Joi.string().uuid()), Joi.string().uuid())
    .optional(),
  cash_prefix: Joi.string().max(10).optional(),
});

module.exports = {
  IncomeStatementChartQuerySchema,
  BalanceSheetChartQuerySchema,
  EquityStatementChartQuerySchema,
  CashFlowChartQuerySchema,
  FinancialsQuerySchema,
};

