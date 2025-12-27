const Joi = require("joi");

const YmdSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required();

const JournalLineSchema = Joi.object({
  account_id: Joi.string().uuid().required(),
  bp_id: Joi.string().uuid().allow(null, "").optional(),
  debit: Joi.number().precision(2).min(0).required(),
  credit: Joi.number().precision(2).min(0).required(),
  memo: Joi.string().allow("", null).max(500).optional(),
}).custom((value, helpers) => {
  const debit = Number(value.debit || 0);
  const credit = Number(value.credit || 0);

  if (debit > 0 && credit === 0) return value;
  if (credit > 0 && debit === 0) return value;

  return helpers.error("any.invalid", {
    message: "Each line must have either debit > 0 or credit > 0 (not both).",
  });
}, "debit/credit exclusive");

const CreateJournalEntrySchema = Joi.object({
  date: YmdSchema,
  memo: Joi.string().allow("", null).max(2000).optional(),
  lines: Joi.array().items(JournalLineSchema).min(2).required(),
});

const UpdateJournalEntrySchema = Joi.object({
  date: YmdSchema.optional(),
  memo: Joi.string().allow("", null).max(2000).optional(),
  lines: Joi.array().items(JournalLineSchema).min(2).optional(),
}).min(1);

// currently unused payload for post, keep as empty object schema
const PostJournalEntrySchema = Joi.object({});

const ReverseJournalEntrySchema = Joi.object({
  date: YmdSchema.optional(),
  memo: Joi.string().allow("", null).max(2000).optional(),
});

module.exports = {
  JournalLineSchema,
  CreateJournalEntrySchema,
  UpdateJournalEntrySchema,
  PostJournalEntrySchema,
  ReverseJournalEntrySchema,
};

