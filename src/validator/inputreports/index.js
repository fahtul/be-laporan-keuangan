const InvariantError = require("../../exceptions/InvariantError");
const {
  ImageHeadersSchema,
  InputReportCreateSchema,
  GetReportsPaginationSchema,
  DeleteReportParamsSchema,
} = require("./schema");

const InputReportValidator = {
  // Validasi untuk file PDF
  validatePdfFile: (headers) => {
    const validationResult = ImageHeadersSchema.validate(headers);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  // Validasi untuk payload pembuatan laporan
  validateInputReportCreationPayload: (payload) => {
    const validationResult = InputReportCreateSchema.validate(payload, {
      abortEarly: false,
    });

    if (validationResult.error) {
      throw new InvariantError(
        `Validation error: ${validationResult.error.details
          .map((err) => err.message)
          .join(", ")}`
      );
    }
  },

  validateGetReports: (query) => {
    const validationResult = GetReportsPaginationSchema.validate(query, {
      abortEarly: false,
    });

    if (validationResult.error) {
      throw new InvariantError(
        validationResult.error.details.map((d) => d.message).join(", ")
      );
    }
  },
};

module.exports = InputReportValidator;
