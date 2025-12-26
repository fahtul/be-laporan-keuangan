const Joi = require("joi");

const JournalLineSchema = Joi.object({
  account_id: Joi.string().uuid().required(),
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

const CreateOpeningBalanceSchema = Joi.object({
  date: Joi.date().required(),
  memo: Joi.string().allow("", null).max(2000).optional(),
  opening_key: Joi.string().max(20).required(),
  lines: Joi.array().items(JournalLineSchema).min(2).required(),
});

module.exports = { CreateOpeningBalanceSchema };
