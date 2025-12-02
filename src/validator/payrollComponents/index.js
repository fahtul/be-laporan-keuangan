// src/validator/payrollComponents/index.js

const {
  ComponentPayloadSchema,
  ImportCsvSchema,
  ImportExcelSchema,
} = require("./schema");

class PayrollComponentsValidator {
  // Validate create/update JSON body
  validatePayload(payload) {
    const { error } = ComponentPayloadSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.details = error.details;
      err.statusCode = 400;
      throw err;
    }
  }

  // Validate multipart CSV upload
  validateImportCsv(payload) {
    const { error } = ImportCsvSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: true, // allow other parts if any
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.details = error.details;
      err.statusCode = 400;
      throw err;
    }
  }

  // Validate multipart Excel upload
  validateImportExcel(payload) {
    const { error } = ImportExcelSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: true,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.details = error.details;
      err.statusCode = 400;
      throw err;
    }
  }
}

module.exports = new PayrollComponentsValidator();
