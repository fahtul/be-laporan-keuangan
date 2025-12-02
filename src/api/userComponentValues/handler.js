class UserComponentValuesHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;

    this.postUpsertHandler = this.postUpsertHandler.bind(this);
    this.getListHandler = this.getListHandler.bind(this);
    this.getByIdHandler = this.getByIdHandler.bind(this);
    this.deleteHandler = this.deleteHandler.bind(this);
    this.importCsvHandler = this.importCsvHandler.bind(this);
    this.exportExcelHandler = this.exportExcelHandler.bind(this);
    this.importExcelHandler = this.importExcelHandler.bind(this);

    this.postBulkUpsertHandler = this.postBulkUpsertHandler.bind(this);
  }

  // New bulk handler
  async postBulkUpsertHandler(request, h) {
    try {
      // this will throw if validation fails
      this._validator.validateBulkUpsert(request.payload);

      // if we get here, payload is valid
      const { userId, items } = request.payload;
      const result = await this._service.bulkUpsert({ userId, items });
      return h
        .response({ status: "success", data: { results: result } })
        .code(201);
    } catch (err) {
      // if it's a Joi‐driven 400 or other error
      const code = err.statusCode === 400 ? 400 : err.statusCode || 500;
      return h.response({ status: "fail", message: err.message }).code(code);
    }
  }

  async postUpsertHandler(request, h) {
    try {
      this._validator.validateUpsert(request.payload);
      const id = await this._service.upsert(request.payload);
      return h.response({ status: "success", data: { id } }).code(201);
    } catch (err) {
      return h
        .response({ status: "fail", message: err.message })
        .code(err.statusCode || 500);
    }
  }

  async getListHandler(request) {
    const { page = 1, limit = 10, search = "" } = request.query;
    const offset = (page - 1) * limit;
    const [rows, count] = await Promise.all([
      this._service.getValues(limit, offset, search),
      this._service.getValuesCount(search),
    ]);
    return {
      status: "success",
      data: {
        values: rows,
        meta: {
          page,
          limit,
          total: count,
          totalPage: Math.ceil(count / limit),
        },
      },
    };
  }

  async getByIdHandler(request, h) {
    try {
      const row = await this._service.getById(request.params.id);
      return { status: "success", data: { value: row } };
    } catch (err) {
      return h.response({ status: "fail", message: err.message }).code(404);
    }
  }

  async deleteHandler(request, h) {
    try {
      await this._service.delete(request.params.id);
      return { status: "success", message: "Deleted" };
    } catch (err) {
      return h.response({ status: "fail", message: err.message }).code(404);
    }
  }

  async importCsvHandler(request, h) {
    try {
      this._validator.validateImportCsv(request.payload);
      const buffer = request.payload.file._data;
      const results = await this._service.importCsv(buffer.toString());
      return { status: "success", data: { results } };
    } catch (err) {
      return h
        .response({ status: "fail", message: err.message })
        .code(err.statusCode || 400);
    }
  }

  async exportExcelHandler(request, h) {
    const buf = await this._service.exportExcel();
    return h
      .response(buf)
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header(
        "Content-Disposition",
        `attachment; filename="user_components.xlsx"`
      );
  }

  async importExcelHandler(request, h) {
    try {
      this._validator.validateImportExcel(request.payload);
      const buffer = request.payload.file._data;
      const results = await this._service.importExcel(buffer);
      return { status: "success", data: { results } };
    } catch (err) {
      return h
        .response({ status: "fail", message: err.message })
        .code(err.statusCode || 400);
    }
  }
}

module.exports = UserComponentValuesHandler;
