// src/api/overtime/validator.js
const Joi = require("joi");

const monthlySummaryQuery = Joi.object({
  year: Joi.number().integer().min(2000).required(),
  month: Joi.number().integer().min(1).max(12).required(),
  status: Joi.string()
    .valid("draft", "locked", "approved", "published")
    .optional(),
  group: Joi.string().valid("user", "unit").optional(), // for /overtime/summary/export
  format: Joi.string().valid("csv").optional(),
});

const unitDetailParams = Joi.object({
  unitId: Joi.string().required(),
});

class OvertimeValidator {
  validateMonthlySummaryQuery(q) {
    const { error } = monthlySummaryQuery.validate(q);
    if (error) throw error;
  }
  validateUnitDetailQuery({ params, query }) {
    const p = unitDetailParams.validate(params);
    if (p.error) throw p.error;
    const qv = monthlySummaryQuery.validate(query);
    if (qv.error) throw qv.error;
  }
  // export checks can reuse above
  validateExportMonthly(q) {
    return this.validateMonthlySummaryQuery(q);
  }
  validateExportUnit(q) {
    return this.validateMonthlySummaryQuery(q);
  }
  validateExportUnitDetail({ params, query }) {
    return this.validateUnitDetailQuery({ params, query });
  }
}

module.exports = OvertimeValidator;
