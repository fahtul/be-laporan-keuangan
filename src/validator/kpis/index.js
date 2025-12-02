const InvariantError = require("../../exceptions/InvariantError");
const {
  PdfHeadersSchema,
  KpiSchema,
  GetKpisPaginationSchema,
} = require("./schema");

const UploadKpiValidator = {
  validateKpiFile: (headers, payload) => {
    const validationResult = PdfHeadersSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateKpiPayload: (headers, payload) => {
    const validationResult = KpiSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateGetKpis: (request, h) => {
    const validationResult = GetKpisPaginationSchema.validate(
      request.params
    );
    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UploadKpiValidator;
