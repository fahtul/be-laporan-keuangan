// src/validator/workSchedules/index.js
const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateWorkScheduleSchema,
  UpdateWorkScheduleSchema,
  BulkOverrideSchema,
} = require("./schema");

const WorkScheduleValidator = {
  validateCreatePayload: (payload) => {
    const { error } = CreateWorkScheduleSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateUpdatePayload: (payload) => {
    const { error } = UpdateWorkScheduleSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateBulkOverride: (payload) => {
    const { error } = BulkOverrideSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
};

module.exports = WorkScheduleValidator;
