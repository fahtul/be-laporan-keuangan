const Joi = require("joi");

// Payload for create/update (upsert)
const UpsertSchema = Joi.object({
  userId: Joi.string().required(),
  componentId: Joi.string().required(),
  amount: Joi.number().precision(2).min(0).required(),
});

// For CSV import: expect a single file part named `file`
const ImportCsvSchema = Joi.object({
  file: Joi.object({
    hapi: Joi.object({
      headers: Joi.object({
        "content-type": Joi.string()
          .regex(/(text\/csv|application\/csv|application\/vnd\.ms-excel)/)
          .required(),
      }).required(),
    }).required(),
    _data: Joi.binary().required(),
  }).required(),
});

// For Excel import: expect a single file part named `file`
const ImportExcelSchema = Joi.object({
  file: Joi.object({
    hapi: Joi.object({
      headers: Joi.object({
        "content-type": Joi.string()
          .regex(
            /(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel)/
          )
          .required(),
      }).required(),
    }).required(),
    _data: Joi.binary().required(),
  }).required(),
});

const BulkUpsertSchema = Joi.object({
  userId: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        componentId: Joi.string().required(),
        amount: Joi.number().precision(2).min(0).required(),
      })
    )
    .min(1)
    .required(),
});

module.exports = {
  UpsertSchema,
  ImportCsvSchema,
  ImportExcelSchema,
  BulkUpsertSchema,
};
