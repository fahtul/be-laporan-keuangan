// src/validator/payrollComponents/schema.js
const Joi = require("joi");

// Payload for create/update
const ComponentPayloadSchema = Joi.object({
  name: Joi.string().max(100).required(),
  type: Joi.string().max(50).required(),
});

// For CSV import: require a single file part
const ImportCsvSchema = Joi.object({
  file: Joi.object({
    hapi: Joi.object({
      headers: Joi.object({
        "content-type": Joi.string()
          .valid("text/csv", "application/csv", "application/vnd.ms-excel")
          .required(),
      }).required(),
    }).required(),
    _data: Joi.any(), // the stream payload
  }).required(),
});

// For Excel import: require a single file part
const ImportExcelSchema = Joi.object({
  file: Joi.object({
    hapi: Joi.object({
      headers: Joi.object({
        "content-type": Joi.string()
          .valid(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel"
          )
          .required(),
      }).required(),
    }).required(),
    _data: Joi.any(),
  }).required(),
});

module.exports = {
  ComponentPayloadSchema,
  ImportCsvSchema,
  ImportExcelSchema,
};
