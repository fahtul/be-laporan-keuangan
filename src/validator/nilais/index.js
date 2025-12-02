const InvariantError = require("../../exceptions/InvariantError");
const {
  PdfHeadersSchema,
  NilaiSchema,
  GetNilaisPaginationSchema,
} = require("./schema");

const UploadNilaiValidator = {
  validateNilaiFile: (headers, payload) => {
    const validationResult = PdfHeadersSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateNilaiPayload: (headers, payload) => {
    const validationResult = NilaiSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },

  validateGetNilais: (request, h) => {
    const validationResult = GetNilaisPaginationSchema.validate(
      request.params
    );
    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
};

module.exports = UploadNilaiValidator;
