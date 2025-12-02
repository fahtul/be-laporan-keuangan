// src/validator/attendanceSusulan/index.js

const Joi = require("joi");
const InvariantError = require("../../exceptions/InvariantError");
const { CreateSusulanSchema, UpdateSusulanSchema } = require("./schema");

const IdParamSchema = Joi.object({
  id: Joi.string().required(),
});

const AttendanceSusulanValidator = {
  validateCreateSusulan: (payload) => {
    const { error } = CreateSusulanSchema.validate(payload, {
      abortEarly: false,
    });
    if (error) {
      throw new InvariantError(error.details.map((d) => d.message).join(", "));
    }
  },

  validateUpdateSusulan: (payload) => {
    const { error } = UpdateSusulanSchema.validate(payload, {
      abortEarly: false,
    });
    if (error) {
      throw new InvariantError(error.details.map((d) => d.message).join(", "));
    }
  },

  validateParams: (params) => {
    const { error } = IdParamSchema.validate(params);
    if (error) {
      throw new InvariantError(error.message);
    }
  },
};

module.exports = AttendanceSusulanValidator;
