const Joi = require("joi");

const CreateSusulanSchema = Joi.object({
  type: Joi.string().valid("checkin", "checkout").required(),
  attendance_date: Joi.date().required(),

  // If type === 'checkin', this is required; otherwise it's optional (can be null/empty)
  checkin_time: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .when("type", {
      is: "checkin",
      then: Joi.required().messages({
        "any.required": "checkin_time is required when type is 'checkin'.",
      }),
      otherwise: Joi.optional().allow(null, "").messages({
        "string.pattern.base": "checkin_time must be in HH:mm format.",
      }),
    }),

  // If type === 'checkout', this is required; otherwise it's optional (can be null/empty)
  checkout_time: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .when("type", {
      is: "checkout",
      then: Joi.required().messages({
        "any.required": "checkout_time is required when type is 'checkout'.",
      }),
      otherwise: Joi.optional().allow(null, "").messages({
        "string.pattern.base": "checkout_time must be in HH:mm format.",
      }),
    }),

  reason: Joi.string().allow("", null),
});

const UpdateSusulanSchema = Joi.object({
  status: Joi.string().valid("approved", "rejected").required(),
  note: Joi.string().allow("", null),
});

module.exports = {
  CreateSusulanSchema,
  UpdateSusulanSchema,
};
