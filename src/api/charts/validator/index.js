const InvariantError = require("../../../exceptions/InvariantError");
const {
  IncomeStatementChartQuerySchema,
  BalanceSheetChartQuerySchema,
  EquityStatementChartQuerySchema,
  CashFlowChartQuerySchema,
  FinancialsQuerySchema,
} = require("./schema");

function validate(schema, payload) {
  const { value, error } = schema.validate(payload, {
    abortEarly: true,
    allowUnknown: true,
    convert: true,
    stripUnknown: true,
  });
  if (error) throw new InvariantError(error.message);
  return value;
}

module.exports = {
  validateIncomeStatementQuery(query) {
    return validate(IncomeStatementChartQuerySchema, query);
  },
  validateBalanceSheetQuery(query) {
    return validate(BalanceSheetChartQuerySchema, query);
  },
  validateEquityStatementQuery(query) {
    return validate(EquityStatementChartQuerySchema, query);
  },
  validateCashFlowQuery(query) {
    return validate(CashFlowChartQuerySchema, query);
  },
  validateFinancialsQuery(query) {
    return validate(FinancialsQuerySchema, query);
  },
};

