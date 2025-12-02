const autoBind = require("auto-bind");
const InvariantError = require("../../exceptions/InvariantError");

class WorkSchedulesHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;
    autoBind(this);
  }

  _normalizeTimeHHmm(t) {
    return t.length === 5 ? `${t}:00` : t;
  }

  // GET /work-schedules
  async getAllWorkSchedulesHandler(request, h) {
    try {
      const schedules = await this._service.getAllSchedules();
      return h.response({ status: "success", data: { schedules } }).code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Gagal mengambil schedules" })
        .code(500);
    }
  }

  // POST /work-schedules
  async postWorkScheduleHandler(request, h) {
    this._validator.validateCreatePayload(request.payload);
    const { userId } = request.payload;
    let { expected_checkin, expected_checkout } = request.payload;
    expected_checkin = this._normalizeTimeHHmm(expected_checkin);
    expected_checkout = this._normalizeTimeHHmm(expected_checkout);
    try {
      await this._service.addSchedule({
        userId,
        expected_checkin,
        expected_checkout,
      });
      return h
        .response({ status: "success", message: "Schedule created" })
        .code(201);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // GET /work-schedules/{id}
  async getWorkScheduleHandler(request, h) {
    const userId = request.params.id;
    try {
      const schedule = await this._service.getSchedule(userId);
      return h.response({ status: "success", data: { schedule } }).code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(404);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // PUT /work-schedules/{id}
  async putWorkScheduleHandler(request, h) {
    this._validator.validateUpdatePayload(request.payload);
    const userId = request.params.id;
    let { expected_checkin, expected_checkout } = request.payload;
    expected_checkin = this._normalizeTimeHHmm(expected_checkin);
    expected_checkout = this._normalizeTimeHHmm(expected_checkout);
    try {
      await this._service.updateSchedule(userId, {
        expected_checkin,
        expected_checkout,
      });
      return h
        .response({ status: "success", message: "Schedule updated" })
        .code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(404);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // DELETE /work-schedules/{id}
  async deleteWorkScheduleHandler(request, h) {
    const userId = request.params.id;
    try {
      await this._service.deleteSchedule(userId);
      return h
        .response({ status: "success", message: "Schedule deleted" })
        .code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // GET /work-schedules/{id}/overrides
  async getOverridesHandler(request, h) {
    const userId = request.params.id;
    const yearMonth = request.query.month;
    try {
      const overrides = await this._service.getOverridesForUserMonth(
        userId,
        yearMonth
      );
      return h.response({ status: "success", data: { overrides } }).code(200);
    } catch (err) {
      console.error(err);
      return h
        .response({ status: "error", message: "Gagal mengambil overrides" })
        .code(500);
    }
  }

  // POST /work-schedules/{id}/overrides
  async createOverrideHandler(request, h) {
    this._validator.validateCreatePayload(request.payload);
    const { userId, scheduled_date, expected_checkin, expected_checkout } =
      request.payload;
    const ci = this._normalizeTimeHHmm(expected_checkin);
    const co = this._normalizeTimeHHmm(expected_checkout);
    try {
      await this._service.bulkCreateOverrides(
        userId,
        request.payload.month,
        request.payload.weekdays
      );
      return h
        .response({ status: "success", message: "Bulk overrides created" })
        .code(201);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }

  // **New**: Batch override—set an array of per‐date overrides
  // POST /work-schedules/{id}/overrides/batch
  async batchOverridesHandler(request, h) {
    this._validator.validateBulkOverride(request.payload);
    const userId = request.params.id;
    const { yearMonth, overrides } = request.payload;
    // Adjust times to HH:mm:00
    const normalized = overrides.map((o) => ({
      date: o.date,
      expected_checkin: this._normalizeTimeHHmm(o.expected_checkin),
      expected_checkout: this._normalizeTimeHHmm(o.expected_checkout),
    }));
    try {
      // Use the setOverridesForMonth (upsert) method
      await this._service.setOverridesForMonth(userId, yearMonth, normalized);
      return h
        .response({ status: "success", message: "Overrides saved" })
        .code(200);
    } catch (err) {
      if (err instanceof InvariantError) {
        return h.response({ status: "fail", message: err.message }).code(400);
      }
      console.error(err);
      return h
        .response({ status: "error", message: "Internal Server Error" })
        .code(500);
    }
  }
}

module.exports = WorkSchedulesHandler;
