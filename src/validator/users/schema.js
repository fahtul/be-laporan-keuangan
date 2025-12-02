const Joi = require("joi");

const usernamePattern = /^[^\s]+$/;

const UserPayloadSchema = Joi.object({
  username: Joi.string().pattern(usernamePattern, "no spaces").required(),
  fullname: Joi.string().required(),
  password: Joi.string().required(),
  divisionId: Joi.string().allow("").optional(),
  unitId: Joi.string().allow("").optional(),
  roleId: Joi.number().required(),
  adminStatus: Joi.number().required(),
  basicSalary: Joi.number().integer().min(0).default(0).required(),
  hired_date: Joi.date()
    .iso()
    .messages({
      "date.base": "hired_date must be a valid date",
      "date.format": "hired_date must be in ISO format (YYYY-MM-DD)",
    })
    .required(),
});

const UpdateUserPayloadSchema = Joi.object({
  fullname: Joi.string().required(),
  divisionId: Joi.string().allow("").optional(),
  unitId: Joi.string().allow("").optional(),
  roleId: Joi.number().required(),
  adminStatus: Joi.number().required(),
  basicSalary: Joi.number().integer().min(0).default(0).required(),
});

const UpdateUserPasswordPayloadSchema = Joi.object({
  username: Joi.string().required(),
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().required(),
});

const DeleteUserIdSchema = Joi.object({
  id: Joi.string().required(),
});

const GetUsersPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).required(),
  limit: Joi.number().integer().min(1).max(100).default(10).required(),
  search: Joi.string().allow("").optional(),
  // hanya boleh: "all" atau kombinasi 0/1/2 dipisah koma (0,1,2)
  is_active: Joi.string()
    .pattern(/^(all|[0-2](,[0-2])*)$/)
    .optional(),
});

const ImportUserSalarySchema = Joi.object({
  file: Joi.object({
    _data: Joi.binary().required(), // Hapi stores uploaded file buffer here
    hapi: Joi.object({
      filename: Joi.string().required(),
      headers: Joi.object().required(),
    }).required(),
  }).required(),
});

module.exports = {
  UserPayloadSchema,
  UpdateUserPayloadSchema,
  UpdateUserPasswordPayloadSchema,
  DeleteUserIdSchema,
  GetUsersPaginationSchema,
  ImportUserSalarySchema,
};
