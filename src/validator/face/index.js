const InvariantError = require("../../exceptions/InvariantError");
const {
  UploadFacePayloadSchema,
  UpdateFacePayloadSchema,
} = require("./schema");

const FaceValidator = {
  validateUploadPayload: (payload) => {
    const result = UploadFacePayloadSchema.validate(payload, {
      abortEarly: false,
    });
    if (result.error) {
      throw new InvariantError(result.error.message);
    }
  },

  validateUpdatePayload: (payload) => {
    const result = UpdateFacePayloadSchema.validate(payload, {
      abortEarly: false,
    });
    if (result.error) {
      throw new InvariantError(result.error.message);
    }
  },
};

module.exports = FaceValidator;
