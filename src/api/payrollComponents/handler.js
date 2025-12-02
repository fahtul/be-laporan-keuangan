const ClientError = require("../../exceptions/ClientError");

class PayrollComponentsHandler {
  constructor(service, validator) {
    this._service = service;
    this._validator = validator;

    // bind methods
    this.postComponentHandler = this.postComponentHandler.bind(this);
    this.getComponentsHandler = this.getComponentsHandler.bind(this);
    this.getComponentByIdHandler = this.getComponentByIdHandler.bind(this);
    this.putComponentHandler = this.putComponentHandler.bind(this);
    this.deleteComponentHandler = this.deleteComponentHandler.bind(this);
    this.importCsvHandler = this.importCsvHandler.bind(this);
    this.exportExcelHandler = this.exportExcelHandler.bind(this);
    this.importExcelHandler = this.importExcelHandler.bind(this);
  }

  async postComponentHandler(request, h) {
    try {
      this._validator.validatePayload(request.payload);
      const id = await this._service.createComponent(request.payload);
      return h.response({ status: "success", data: { id } }).code(201);
    } catch (err) {
      if (err.statusCode) {
        throw err; // Handled by ClientError or Hapi
      }
      console.error(err);
      throw new ClientError("Internal server error", 500);
    }
  }

  async getComponentsHandler(request, h) {
    try {
      const { page = 1, limit = 100, search = "" } = request.query;
      const offset = (Number(page) - 1) * Number(limit);

      const components = await this._service.getComponents(
        Number(limit),
        offset,
        search
      );
      const total = await this._service.getComponentsCount(search);

      return h.response({
        status: "success",
        data: {
          components,
          meta: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPage: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("❌ Error in getComponentsHandler:", error);
      return h
        .response({
          status: "fail",
          message: error.message || "Gagal mengambil komponen.",
        })
        .code(500);
    }
  }

  async getComponentByIdHandler(request, h) {
    const { id } = request.params;
    const component = await this._service.getComponentById(id);
    return { status: "success", data: { component } };
  }

  async putComponentHandler(request, h) {
    try {
      const { id } = request.params;
      this._validator.validatePayload(request.payload);
      await this._service.updateComponent(id, request.payload);
      return { status: "success", message: "Component updated" };
    } catch (err) {
      if (err.statusCode) throw err;
      console.error(err);
      throw new ClientError("Internal server error", 500);
    }
  }

  async deleteComponentHandler(request, h) {
    const { id } = request.params;
    await this._service.deleteComponent(id);
    return { status: "success", message: "Component deleted" };
  }
  
  async importCsvHandler(request, h) {
    // payload.file._data is the Buffer
    this._validator.validateImportCsv(request.payload);
    const buffer = request.payload.file._data;
    const results = await this._service.importComponentsCsv(
      buffer.toString("utf-8")
    );
    return { status: "success", data: { results } };
  }

  async exportExcelHandler(request, h) {
    const excelBuffer = await this._service.exportComponentsExcel();
    return h
      .response(excelBuffer)
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header("Content-Disposition", 'attachment; filename="components.xlsx"');
  }

  async importExcelHandler(request, h) {
    this._validator.validateImportExcel(request.payload);
    const buffer = request.payload.file._data;
    const results = await this._service.importComponentsExcel(buffer);
    return { status: "success", data: { results } };
  }
}

module.exports = PayrollComponentsHandler;
