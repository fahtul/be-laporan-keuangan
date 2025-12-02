const InvariantError = require("../../exceptions/InvariantError");
const {
  AttendancePayloadSchema,
  GetAttendancesQuerySchema,
  ManualTimesPayloadSchema,
} = require("./schema");

const AttendanceValidator = {
  validateAttendancePayload: (payload) => {
    const { error } = AttendancePayloadSchema.validate(payload);
    if (error) {
      throw new InvariantError(error.message);
    }
  },

  validateGetAllQuery: (query) => {
    const { error } = GetAttendancesQuerySchema.validate(query);
    if (error) {
      throw new InvariantError(error.message);
    }
  },
  validateManualTimesPayload: (payload) => {
    const { error, value } = ManualTimesPayloadSchema.validate(payload);
    if (error) throw new InvariantError(error.message);
    return value; // return normalized (adds default source)
  },
};

module.exports = AttendanceValidator;
