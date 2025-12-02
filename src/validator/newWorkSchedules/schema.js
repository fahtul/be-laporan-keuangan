const Joi = require("joi");

const CreateScheduleCategorySchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().optional(),
  time_start: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
  time_end: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
});

const AssignUserSchedulesSchema = Joi.object({
  user_id: Joi.string().required(),
  month: Joi.string()
    .pattern(/^\d{4}-\d{2}$/)
    .required(),
  assignments: Joi.array()
    .items(
      Joi.object({
        date: Joi.string()
          .pattern(/^\d{4}-\d{2}-\d{2}$/)
          .required(),
        category_id: Joi.string().required(),
      })
    )
    .required(),
});

const GetUserSchedulesQuerySchema = Joi.object({
  user_id: Joi.string().required(),
  month: Joi.string()
    .pattern(/^\d{4}-\d{2}$/)
    .required(),
});

module.exports = {
  CreateScheduleCategorySchema,
  AssignUserSchedulesSchema,
  GetUserSchedulesQuerySchema,
};
