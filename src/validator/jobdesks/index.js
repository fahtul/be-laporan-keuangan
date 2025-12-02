const InvariantError = require("../../exceptions/InvariantError");
const {
  PdfHeadersSchema,
  JobdeskSchema,
  GetJobdesksPaginationSchema,
} = require("./schema");

const UploadJobdeskValidator = {
  validateJobdeskFile: (headers, payload) => {
    const validationResult = PdfHeadersSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateJobdeskPayload: (headers, payload) => {
    const validationResult = JobdeskSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateGetJobdesks: (request, h) => {
    const validationResult = GetJobdesksPaginationSchema.validate(
      request.params
    );
    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UploadJobdeskValidator;
