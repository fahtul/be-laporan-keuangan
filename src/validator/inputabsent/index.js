const InvariantError = require("../../exceptions/InvariantError");
const {
  PdfHeadersSchema,
  InputAbsentCreateSchema,
  // InputAbsentSelectSchema,
} = require("./schema");

const InputAbsentValidator = {

  // Validasi untuk payload pembuatan laporan
  validateInputAbsentCreationPayload: (payload) => {
    const validationResult = InputAbsentCreateSchema.validate(payload, {
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

  // Validasi untuk kriteria pemilihan laporan
  // validateInputAbsentSelectionCriteria: (criteria) => {
  //   const validationResult = InputAbsentSelectSchema.validate(criteria, {
  //     abortEarly: false,
  //   });

  //   if (validationResult.error) {
  //     throw new InvariantError(
  //       `Validation error: ${validationResult.error.details
  //         .map((err) => err.message)
  //         .join(", ")}`
  //     );
  //   }
  // },
};

module.exports = InputAbsentValidator;
