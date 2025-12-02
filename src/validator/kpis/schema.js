const Joi = require("joi");

const PdfHeadersSchema = Joi.object({
  "content-type": Joi.string().valid("application/pdf").required(),
}).unknown();

const KpiSchema = Joi.object({
  unitId: Joi.string().required(),
  divisionId: Joi.string().required(),
  title: Joi.string().required(),
  description: Joi.string().required(),
  kpiFile: Joi.any().required(),
});

const GetKpisPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).required(),
  limit: Joi.number().integer().min(1).max(100).default(10).required(),
});

module.exports = {
  PdfHeadersSchema,
  KpiSchema,
  GetKpisPaginationSchema,
};
