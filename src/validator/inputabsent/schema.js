const Joi = require("joi");

// Schema untuk payload laporan
const InputAbsentCreateSchema = Joi.object({
  division_name: Joi.string()
    .required()
    .messages({
      "string.base": "Division name must be a string.",
    }),
  position: Joi.string().required().messages({
    "string.base": "Position name must be a string.",
  }),
  activity_type: Joi.string().required().messages({
    "string.base": "Activity Type must be a string.",
  }),
  description: Joi.string().required().messages({
    "string.base": "Description must be a string.",
  }),
  duration_hours: Joi.number().required().messages({
    "string.base": "Duration must be a number.",
  }),
  duration_minutes: Joi.number().required().messages({
    "string.base": "Duration must be a number.",
  }),
});

// // Schema untuk memilih laporan berdasarkan kriteria
// const InputReportSelectSchema = Joi.object({
//   year: Joi.string()
//     .length(4)
//     .regex(/^\d{4}$/)
//     .optional()
//     .messages({
//       "string.base": "Year must be a string.",
//       "string.length": "Year must be 4 characters.",
//       "string.pattern.base": "Year must be a valid 4-digit year.",
//     }),
//   month: Joi.string()
//     .valid(
//       "Januari", "Februari", "Maret", "April", "Mei", "Juni",
//       "Juli", "Agustus", "September", "Oktober", "November", "Desember"
//     )
//     .optional()
//     .messages({
//       "any.only": "Month must be one of the valid Indonesian months.",
//     }),
//   report_type: Joi.string()
//     .valid(
//       "Laporan Direktur", "Laporan SPI", "Laporan Komite",
//       "Laporan Tim Terpadu", "Laporan Kepala Divisi",
//       "Laporan Kepala Unit", "Laporan Khusus"
//     )
//     .optional()
//     .messages({
//       "any.only": "Report type must be one of the predefined options.",
//     }),
// });

module.exports = {
  PdfHeadersSchema,
  InputAbsentCreateSchema,
  // InputReportSelectSchema,
};
