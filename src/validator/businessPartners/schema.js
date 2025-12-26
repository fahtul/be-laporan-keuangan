const Joi = require("joi");

const BpCategorySchema = Joi.string().valid(
  "customer",
  "supplier",
  "patient",
  "doctor",
  "insurer",
  "employee",
  "other"
);

const NormalBalanceSchema = Joi.string().valid("debit", "credit");

const CreateBusinessPartnerSchema = Joi.object({
  code: Joi.string().max(50).required(),
  name: Joi.string().max(200).required(),

  category: BpCategorySchema.optional(),
  normal_balance: NormalBalanceSchema.optional(),

  is_active: Joi.boolean().optional(),
});

const UpdateBusinessPartnerSchema = Joi.object({
  code: Joi.string().max(50).optional(),
  name: Joi.string().max(200).optional(),

  category: BpCategorySchema.optional(),
  normal_balance: NormalBalanceSchema.optional(),

  is_active: Joi.boolean().optional(),
}).min(1);

module.exports = {
  CreateBusinessPartnerSchema,
  UpdateBusinessPartnerSchema,
};
