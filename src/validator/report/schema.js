const Joi = require("joi");

const ImageHeadersSchema = Joi.object({
  "content-type": Joi.string().valid("image/jpeg", "image/png").required(),
}).unknown();

const ReportSchema = Joi.object({
  finding: Joi.string().required(),
  discoveryDate: Joi.date().iso().required(), // Use .date().iso() for ISO date format
  cause: Joi.string().optional(), // Use .optional() if it might be empty
  recomendation: Joi.string().optional(), // Use .optional() if it might be empty
  targetDate: Joi.date().iso().required(), // Use .date().iso() for ISO date format
  picUserId: Joi.string().required(),
  evidancePhoto: Joi.any().required(),
});

const UpdateReportProgressPICSchema = Joi.object({
  note: Joi.string().required(),
  progressPhoto: Joi.any().required(),
});

const UpdateReportDonePICSchema = Joi.object({
  note: Joi.string().required(),
  donePhoto: Joi.any().required(),
});

const GetJaspelsPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).required(),
  limit: Joi.number().integer().min(1).max(100).default(10).required(),
});

const UnitLeaderUpdateReport = Joi.object({
  note: Joi.string().required(),
});

module.exports = {
  ImageHeadersSchema,
  ReportSchema,
  GetJaspelsPaginationSchema,
  UnitLeaderUpdateReport,
  UpdateReportProgressPICSchema,
  UpdateReportDonePICSchema,
};
