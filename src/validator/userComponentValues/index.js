const {
  UpsertSchema,
  ImportCsvSchema,
  ImportExcelSchema,
  BulkUpsertSchema,
} = require("./schema");

class UserComponentValuesValidator {
  validateUpsert(payload) {
    const { error } = UpsertSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.statusCode = 400;
      err.details = error.details;
      throw err;
    }
  }

  validateBulkUpsert(payload) {
    const { error } = BulkUpsertSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.statusCode = 400;
      err.details = error.details;
      throw err;
    }
  }

  validateImportCsv(payload) {
    const { error } = ImportCsvSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: true,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.statusCode = 400;
      err.details = error.details;
      throw err;
    }
  }

  validateImportExcel(payload) {
    const { error } = ImportExcelSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: true,
    });
    if (error) {
      const msg = error.details.map((d) => d.message).join(", ");
      const err = new Error(msg);
      err.statusCode = 400;
      err.details = error.details;
      throw err;
    }
  }
}

module.exports = new UserComponentValuesValidator();
