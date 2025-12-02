const InvariantError = require("../../exceptions/InvariantError");
const {
  PdfHeadersSchema,
  JaspelSchema,
  GetJaspelsPaginationSchema,
} = require("./schema");

const UploadJaspelValidator = {
  validateJaspelFile: (headers, payload) => {
    const validationResult = PdfHeadersSchema.validate(headers, payload);

    if (validationResult.error) {
      throw new InvariantError(validationResult.error.message);
    }
  },
  validateJaspelPayload: (headers, payload) => {
    const validationResult = JaspelSchema.validate(headers, payload);

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
};

module.exports = UploadJaspelValidator;
