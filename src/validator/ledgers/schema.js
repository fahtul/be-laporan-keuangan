const Joi = require("joi");

const GetLedgerSchema = Joi.object({
  account_id: Joi.string().uuid().required(),
  from_date: Joi.date().required(),
  to_date: Joi.date().required(),
});

module.exports = { GetLedgerSchema };
