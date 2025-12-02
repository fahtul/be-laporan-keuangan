const Joi = require("joi");

const DeleteReportParamsSchema = Joi.object({
  reportId: Joi.string().required(),
});

const ImageHeadersSchema = Joi.object({
  "content-type": Joi.string()
    .valid("image/jpeg", "image/jpg", "image/png", "image/webp")
    .required(),
}).unknown();

const InputReportCreateSchema = Joi.object({
  title: Joi.string().max(255).required().messages({
    "string.base": "Title must be a string.",
    "string.max": "Title must not be longer than 255 characters.",
    "any.required": "Title is required.",
  }),

  description: Joi.string().allow("", null).messages({
    "string.base": "Description must be a string.",
  }),

  addReportFile: Joi.any().required().messages({
    "any.required": "File upload (photo) is required.",
  }),
});

// Schema untuk memilih laporan berdasarkan kriteria
const InputReportSelectSchema = Joi.object({
  year: Joi.string()
    .length(4)
    .regex(/^\d{4}$/)
    .optional()
    .messages({
      "string.base": "Year must be a string.",
      "string.length": "Year must be 4 characters.",
      "string.pattern.base": "Year must be a valid 4-digit year.",
    }),
  month: Joi.string()
    .valid(
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    )
    .optional()
    .messages({
      "any.only": "Month must be one of the valid Indonesian months.",
    }),
  report_type: Joi.string()
    .valid(
      "Laporan Direktur",
      "Laporan SPI",
      "Laporan Komite",
      "Laporan Tim Terpadu",
      "Laporan Kepala Divisi",
      "Laporan Kepala Unit",
      "Laporan Khusus",
      "Laporan Perseorangan"
    )
    .optional()
    .messages({
      "any.only": "Report type must be one of the predefined options.",
    }),
});

const GetReportsPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number.",
    "number.min": "Page must be at least 1.",
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number.",
    "number.min": "Limit must be at least 1.",
    "number.max": "Limit must not be greater than 100.",
  }),

  // 🔎 filter opsional
  title: Joi.string().optional().messages({
    "string.base": "Title filter must be a string.",
  }),

  start_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .messages({
      "string.pattern.base":
        "start_date must be in format YYYY-MM-DD (e.g. 2025-12-02).",
    }),

  end_date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .messages({
      "string.pattern.base":
        "end_date must be in format YYYY-MM-DD (e.g. 2025-12-31).",
    }),

  division_id: Joi.string().optional(),
  unit_id: Joi.string().optional(),
});

module.exports = {
  ImageHeadersSchema,
  InputReportCreateSchema,
  InputReportSelectSchema,
  GetReportsPaginationSchema,
  DeleteReportParamsSchema,
};
