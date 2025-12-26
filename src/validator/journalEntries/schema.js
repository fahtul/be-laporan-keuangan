const Joi = require("joi");

const RoleSchema = Joi.string().valid(
  "customer",
  "supplier",
  "patient",
  "doctor",
  "insurer",
  "other"
);

const CreateBusinessPartnerSchema = Joi.object({
  code: Joi.string().max(50).required(), // samakan gaya dengan accounts
  name: Joi.string().max(200).required(),

  // optional: roles
  roles: Joi.array().items(RoleSchema).optional(),

  is_active: Joi.boolean().optional(),
});

const UpdateBusinessPartnerSchema = Joi.object({
  code: Joi.string().max(50).optional(),
  name: Joi.string().max(200).optional(),

  roles: Joi.array().items(RoleSchema).optional(),

  is_active: Joi.boolean().optional(),
}).min(1);

module.exports = { CreateBusinessPartnerSchema, UpdateBusinessPartnerSchema };
