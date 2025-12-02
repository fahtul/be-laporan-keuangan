const { PayrollComponentSchema, OverrideSchema } = require("./schema");

class PayrollValidator {
  /**
   * Validate payload when creating or updating a payroll component.
   */
  validateComponentPayload(payload) {
    const { error } = PayrollComponentSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      const message = error.details.map((d) => d.message).join(", ");
      const err = new Error(message);
      err.details = error.details;
      throw err;
    }
  }

  /**
   * Validate payload when creating or updating an employee override.
   */
  validateOverridePayload(payload) {
    const { error } = OverrideSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      const message = error.details.map((d) => d.message).join(", ");
      const err = new Error(message);
      err.details = error.details;
      throw err;
    }
  }
}

module.exports = new PayrollValidator();
