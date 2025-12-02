const Joi = require("joi");

const PdfHeadersSchema = Joi.object({
  "content-type": Joi.string().valid("application/pdf").required(),
}).unknown();

const DocumentSchema = Joi.object({
  unitId: Joi.string().required(),
  divisionId: Joi.string().required(),
  title: Joi.string().required(),
  description: Joi.string().required(),
  isPublic: Joi.boolean().truthy("true").falsy("false").required(),
  documentFile: Joi.any().required(),
});

const GetDocumentsPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).required(),
  limit: Joi.number().integer().min(1).max(100).default(10).required(),
});

module.exports = {
  PdfHeadersSchema,
  DocumentSchema,
  GetDocumentsPaginationSchema,
};
