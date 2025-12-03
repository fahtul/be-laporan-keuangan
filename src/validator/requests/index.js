// src/validator/requests/index.js
const {
  RequestPayloadSchema,
  ApprovalPayloadSchema,
} = require("./schema");

/**
 * RequestsValidator meng-export tiga fungsi:
 *   1) validateRequestPayload   → cek payload teks + struktur `evidence_photo`
 *   2) validateApprovalPayload  → cek payload approve/reject
 *   3) validateImageFile        → cek header file harus berupa image/*
 */
const RequestsValidator = {
  /**
   * 1) Validasi payload (type, reason, request_date, start_time, end_time, shift_id, evidence_photo).
   *    Jika ada error, gabungkan detail error (abortEarly: false),
   *    lalu lempar Error dengan .details berisi array detailnya.
   */
  validateRequestPayload: async (payload) => {
    const { error } = RequestPayloadSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false, 
      // note: "allowUnknown:false" di sini berarti 
      // kita hanya mengizinkan properti yang disebutkan di schema, 
      // kecuali bagian di schema sendiri yang sudah dites ".unknown(true)". 
    });
    if (error) {
      const allMessages = error.details.map((d) => d.message).join(", ");
      const err = new Error(allMessages);
      err.details = error.details;
      throw err;
    }
  },

  /**
   * 2) Validasi payload approve/reject
   */
  validateApprovalPayload: async (payload) => {
    const { error } = ApprovalPayloadSchema.validate(payload, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) {
      const allMessages = error.details.map((d) => d.message).join(", ");
      const err = new Error(allMessages);
      err.details = error.details;
      throw err;
    }
  },

  /**
   * 3) Validasi header file: pastikan `headers["content-type"]` ada dan diawali "image/".
   *    Jika tidak, throw Error dengan statusCode 400.
   */
  validateImageFile: (headers) => {
    if (
      !headers ||
      !headers["content-type"] ||
      !headers["content-type"].startsWith("image/")
    ) {
      const err = new Error("Unggah bukti harus berupa file gambar (image/*).");
      err.statusCode = 400;
      throw err;
    }
  },
};

module.exports = RequestsValidator;
