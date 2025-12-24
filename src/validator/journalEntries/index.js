const InvariantError = require("../../exceptions/InvariantError");
const {
  CreateJournalEntrySchema,
  UpdateJournalEntrySchema,
  PostJournalEntrySchema,
  ReverseJournalEntrySchema,
} = require("./schema");

module.exports = {
  validateCreate(payload) {
    const { error } = CreateJournalEntrySchema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },

  validateUpdate(payload) {
    const { error } = UpdateJournalEntrySchema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },

  validatePost(payload) {
    const { error } = PostJournalEntrySchema.validate(payload || {}, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },

  validateReverse(payload) {
    const { error } = ReverseJournalEntrySchema.validate(payload || {}, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) throw new InvariantError(error.message);
  },
};
