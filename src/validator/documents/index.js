const InvariantError = require("../../exceptions/InvariantError");
const {
  PdfHeadersSchema,
  DocumentSchema,
  GetDocumentsPaginationSchema,
} = require("./schema");

const UploadDocumentValidator = {
  validateDocumentFile: (headers, payload) => {
    const validationResult = PdfHeadersSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateDocumentPayload: (headers, payload) => {
    const validationResult = DocumentSchema.validate(payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateGetDocuments: (request, h) => {
    const validationResult = GetDocumentsPaginationSchema.validate(
      request.params
    );
    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UploadDocumentValidator;
