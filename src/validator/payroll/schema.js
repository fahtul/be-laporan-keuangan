const Joi = require("joi");

/**
 * Schema for creating or updating a payroll component.
 */
const PayrollComponentSchema = Joi.object({
  code: Joi.string()
    .alphanum()
    .max(20)
    .required()
    .description("Unique code for the component, e.g. BASIC, OVERTIME"),
  name: Joi.string().max(100).required().description("Human‐readable name"),
  type: Joi.string()
    .valid("earning", "deduction", "benefit")
    .required()
    .description("Category of the component"),
  calc_type: Joi.string()
    .valid("fixed", "percentage", "hourly")
    .required()
    .description("How this component is calculated"),
  value: Joi.number()
    .positive()
    .required()
    .description("Base amount or percentage"),
  active: Joi.boolean()
    .required()
    .description("Whether this component is active"),
});

/**
 * Schema for creating or updating an employee override.
 */
const OverrideSchema = Joi.object({
  user_id: Joi.string().required().description("The employee's user ID"),
  component_id: Joi.string().required().description("Payroll component ID"),
  value: Joi.number().positive().required().description("Overridden amount"),
});

module.exports = {
  PayrollComponentSchema,
  OverrideSchema,
};
