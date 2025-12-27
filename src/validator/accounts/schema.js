const Joi = require("joi");

const CfActivitySchema = Joi.string()
  .valid("cash", "operating", "investing", "financing")
  .optional();

const SubledgerSchema = Joi.string().valid("ar", "ap").optional();

const CreateAccountSchema = Joi.object({
  code: Joi.string().max(50).required(),
  name: Joi.string().max(200).required(),
  type: Joi.string()
    .valid("asset", "liability", "equity", "revenue", "expense")
    .required(),

  parent_id: Joi.string().uuid().allow(null, "").optional(),
  is_active: Joi.boolean().optional(),
  is_postable: Joi.boolean().optional(),
  cf_activity: CfActivitySchema.allow(null, ""),
  requires_bp: Joi.boolean().optional(),
  subledger: SubledgerSchema.allow(null, ""),
});

const UpdateAccountSchema = Joi.object({
  code: Joi.string().max(50).optional(),
  name: Joi.string().max(200).optional(),
  type: Joi.string()
    .valid("asset", "liability", "equity", "revenue", "expense")
    .optional(),

  parent_id: Joi.string().uuid().allow(null, "").optional(),
  is_active: Joi.boolean().optional(),
  is_postable: Joi.boolean().optional(),
  cf_activity: CfActivitySchema.allow(null, ""),
  requires_bp: Joi.boolean().optional(),
  subledger: SubledgerSchema.allow(null, ""),
}).min(1);

module.exports = { CreateAccountSchema, UpdateAccountSchema };
