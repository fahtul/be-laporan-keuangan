const InvariantError = require("../../exceptions/InvariantError");
const {
  ImageHeadersSchema,
  ReportSchema,
  GetJaspelsPaginationSchema,
  UnitLeaderUpdateReport,
  UpdateReportProgressPICSchema,
  UpdateReportDonePICSchema,
} = require("./schema");

const UploadReportValidator = {
  validateImageFile: (headers, payload) => {
    const validationResult = ImageHeadersSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateReportPayload: (headers, payload) => {
    const validationResult = ReportSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateProgressReportPICPayload: (headers, payload) => {
    const validationResult = UpdateReportProgressPICSchema.validate(
      headers,
      payload
    );

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateDoneReportPICPayload: (headers, payload) => {
    const validationResult = UpdateReportDonePICSchema.validate(
      headers,
      payload
    );

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateGetJaspels: (request, h) => {
    const validationResult = GetJaspelsPaginationSchema.validate(
      request.params
    );
    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateUnitUpdatePayload: (payload) => {
    const validationResult = UnitLeaderUpdateReport.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UploadReportValidator;
