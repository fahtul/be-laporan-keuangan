const Joi = require("joi");

const UploadFacePayloadSchema = Joi.object({
  user_id: Joi.string().required().label("User ID"),
  photo: Joi.any().required().label("Photo (Face Image)"),
});

const UpdateFacePayloadSchema = Joi.object({
  user_id: Joi.string().required().label("User ID"),
  photo: Joi.any().required().label("New Photo"),
  oldFilename: Joi.string().optional().label("Old Photo Filename"),
});

module.exports = {
  UploadFacePayloadSchema,
  UpdateFacePayloadSchema,
};
