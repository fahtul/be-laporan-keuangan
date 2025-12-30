const Joi = require("joi");

const BpCategorySchema = Joi.string().valid(
  "customer",
  "supplier",
  "vendor",
  "patient",
  "doctor",
  "insurer",
  "insurance",
  "employee",
  "other"
);

const NormalBalanceSchema = Joi.string().valid("debit", "credit");

const CreateBusinessPartnerSchema = Joi.object({
  code: Joi.string().trim().uppercase().max(50).required(),
  name: Joi.string().trim().max(200).required(),

  category: BpCategorySchema.optional(),
  normal_balance: NormalBalanceSchema.optional(),

  is_active: Joi.boolean().optional(),
});

const UpdateBusinessPartnerSchema = Joi.object({
  code: Joi.string().trim().uppercase().max(50).optional(),
  name: Joi.string().trim().max(200).optional(),

  category: BpCategorySchema.optional(),
  normal_balance: NormalBalanceSchema.optional(),

  is_active: Joi.boolean().optional(),
}).min(1);

const ImportModeSchema = Joi.string().valid("upsert", "insert_only").default("upsert");
const ImportSourceSchema = Joi.string().valid("csv", "json", "template").default("json");
const ImportTemplateSchema = Joi.string().valid("hospital_bp_v1").optional();

const ImportBusinessPartnerItemSchema = Joi.object({
  code: Joi.string().trim().uppercase().max(50).required(),
  name: Joi.string().trim().max(200).required(),
  category: BpCategorySchema.optional(),
  normal_balance: NormalBalanceSchema.optional(),
  is_active: Joi.boolean().truthy("1").falsy("0").truthy("true").falsy("false").optional(),
});

const ImportBusinessPartnersSchema = Joi.object({
  mode: ImportModeSchema,
  source: ImportSourceSchema,
  template: ImportTemplateSchema,
  csv: Joi.string().optional(),
  business_partners: Joi.array().items(ImportBusinessPartnerItemSchema).optional(),
}).custom((value, helpers) => {
  const source = String(value.source || "json").toLowerCase();
  if (source === "template") {
    if (!value.template) return helpers.message("template is required when source=template");
  }
  if (source === "csv") {
    if (!value.csv || !String(value.csv).trim()) return helpers.message("csv is required when source=csv");
  }
  if (source === "json") {
    if (!Array.isArray(value.business_partners) || value.business_partners.length === 0) {
      return helpers.message("business_partners is required when source=json");
    }
  }
  return value;
}, "import source validation");

module.exports = {
  CreateBusinessPartnerSchema,
  UpdateBusinessPartnerSchema,
  ImportBusinessPartnersSchema,
};
