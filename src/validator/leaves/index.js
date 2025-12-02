const InvariantError = require("../../exceptions/InvariantError");
const { CreateLeaveSchema, ApproveLeaveSchema } = require("./schema");

const LeaveValidator = {
  validateCreatePayload: (payload) => {
    const { error } = CreateLeaveSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateApprovePayload: (payload) => {
    const { error } = ApproveLeaveSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
};

module.exports = LeaveValidator;
