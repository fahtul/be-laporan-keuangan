const Joi = require("joi");

const EntryStatusSchema = Joi.string().valid("draft", "posted", "void");

const JournalLineSchema = Joi.object({
  account_id: Joi.string().uuid().required(),
  debit: Joi.number().precision(2).min(0).required(),
  credit: Joi.number().precision(2).min(0).required(),
  memo: Joi.string().allow("", null).max(500).optional(),
})
  // XOR debit/credit on request level too (DB also enforces)
  .custom((value, helpers) => {
    const debit = Number(value.debit || 0);
    const credit = Number(value.credit || 0);

    if (debit > 0 && credit === 0) return value;
    if (credit > 0 && debit === 0) return value;

    return helpers.error("any.invalid", {
      message: "Each line must have either debit > 0 or credit > 0 (not both).",
    });
  });

const CreateJournalEntrySchema = Joi.object({
  date: Joi.date().required(), // YYYY-MM-DD accepted
  memo: Joi.string().allow("", null).max(2000).optional(),

  // optional: allow passing lines on create
  lines: Joi.array().items(JournalLineSchema).min(2).optional(),

  // status should be forced by API to draft, but keep optional if you want
  status: EntryStatusSchema.optional(),
});

const UpdateJournalEntrySchema = Joi.object({
  date: Joi.date().optional(),
  memo: Joi.string().allow("", null).max(2000).optional(),

  // usually update replaces all lines (draft only)
  lines: Joi.array().items(JournalLineSchema).min(2).optional(),
}).min(1);

// Post endpoint generally has no body (idempotency key is in header)
// but allow optional memo/posted_at if you ever need
const PostJournalEntrySchema = Joi.object({
  // keep empty by default
}).unknown(false);

// Reverse endpoint: reverse date & memo optional
const ReverseJournalEntrySchema = Joi.object({
  date: Joi.date().optional(),
  memo: Joi.string().allow("", null).max(2000).optional(),

  // optional behavior: auto-post the reversing entry
  auto_post: Joi.boolean().optional(),
}).min(0);

module.exports = {
  JournalLineSchema,
  CreateJournalEntrySchema,
  UpdateJournalEntrySchema,
  PostJournalEntrySchema,
  ReverseJournalEntrySchema,
};
