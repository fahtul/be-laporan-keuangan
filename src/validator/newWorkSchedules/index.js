const {
  CreateScheduleCategorySchema,
  AssignUserSchedulesSchema,
} = require("../../validator/newWorkSchedules/schema");

const InvariantError = require("../../exceptions/InvariantError");

const WorkScheduleValidator = {
  validateCreateCategory: (payload) => {
    const { error } = CreateScheduleCategorySchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateAssignSchedules: (payload) => {
    const { error } = AssignUserSchedulesSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
  },
  validateGetUserSchedulesQuery: (query) => {
    const { error } = GetUserSchedulesQuerySchema.validate(query);
    if (error) throw new InvariantError(error.message);
  },
};

module.exports = WorkScheduleValidator;
