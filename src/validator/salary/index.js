// validator/salary/index.js
const SalaryRunQuerySchema = require("./schema");
const InvariantError = require("../../exceptions/InvariantError");

const SalaryValidator = {
  validateSalaryRunQuery: (query) => {
    const { error } = SalaryRunQuerySchema.validate(query);
    if (error) {
      throw new InvariantError(`Parameter tidak valid: ${error.message}`);
    }
  },
};

module.exports = SalaryValidator;
