const InvariantError = require("../../exceptions/InvariantError");
const { CreateSalaryRuleSchema, UpdateSalaryRuleSchema } = require("./schema");

const SalaryRulesValidator = {
  validateCreatePayload: (payload) => {
    const { error } = CreateSalaryRuleSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateUpdatePayload: (payload) => {
    const { error } = UpdateSalaryRuleSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
};

module.exports = SalaryRulesValidator;
