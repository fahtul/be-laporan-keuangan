// validator/salary/schema.js
const Joi = require("joi");

const SalaryRunQuerySchema = Joi.object({
  year: Joi.number()
    .integer()
    .min(2000) // atau batas bawah lain sesuai kebutuhan
    .max(2100)
    .required(),
  month: Joi.number().integer().min(1).max(12).required(),
});

module.exports = SalaryRunQuerySchema;
