const Joi = require("joi");

const CfActivitySchema = Joi.string()
  .valid("cash", "operating", "investing", "financing")
  .optional();

const SubledgerSchema = Joi.string().valid("ar", "ap").optional();
const SubledgerImportSchema = Joi.string()
  .valid("AR", "AP", "ar", "ap")
  .optional();

const PlCategorySchema = Joi.string()
  .valid(
    "revenue",
    "cogs",
    "opex",
    "depreciation_amortization",
    "non_operating",
    "other"
  )
  .optional();

const ImportModeSchema = Joi.string().valid("upsert", "insert_only").default("upsert");

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
  pl_category: PlCategorySchema.allow(null, ""),
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
  pl_category: PlCategorySchema.allow(null, ""),
  requires_bp: Joi.boolean().optional(),
  subledger: SubledgerSchema.allow(null, ""),
}).min(1);

const ImportAccountsSchema = Joi.object({
  mode: ImportModeSchema.optional(),
  accounts: Joi.array()
    .items(
      Joi.object({
        code: Joi.string().max(50).required(),
        name: Joi.string().max(200).required(),
        type: Joi.string()
          .valid("asset", "liability", "equity", "revenue", "expense")
          .required(),
        parent_code: Joi.string().max(50).allow(null, "").optional(),
        is_postable: Joi.boolean().required(),

        cash_flow_category: Joi.string()
          .valid("cash", "operating", "investing", "financing")
          .allow(null, "")
          .optional(),
        pl_category: PlCategorySchema.allow(null, ""),

        requires_bp: Joi.boolean().optional(),
        subledger: SubledgerImportSchema.allow(null, ""),
      })
    )
    .min(1)
    .max(5000)
    .required(),
});

module.exports = { CreateAccountSchema, UpdateAccountSchema, ImportAccountsSchema };
