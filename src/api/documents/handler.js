const autoBind = require("auto-bind");
const NotFoundError = require("../../exceptions/NotFoundError");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

class DocumentHandler {
  constructor(
    documentService,
    storageService,
    unitService,
    divisionService,
    usersService,
    documentCollaborationService,
    validator
  ) {
    this._documentService = documentService;
    this._storageService = storageService;
    this._unitService = unitService;
    this._divisionService = divisionService;
    this._usersService = usersService;
    this._documentCollaborationService = documentCollaborationService;
    this._validator = validator;

    autoBind(this);
  }
  async postDocumentWithFileHandler(request, h) {
    try {
      const { documentFile } = request.payload;
      this._validator.validateDocumentFile(documentFile.hapi.headers);
      this._validator.validateDocumentPayload(request.payload);

      const { id: credentialId } = request.auth.credentials;
      await this._usersService.getIsUserAdmin(credentialId);

      const {
        unitId,
        divisionId,
        title,
        description,
        isPublic,
        divisionCollabsIds,
        unitCollabsIds,
        userCollabsId,
      } = request.payload;

      const division = await this._unitService.getUnitById(unitId);
      if (!division) {
        throw new NotFoundError("Unit tidak ditemukan");
      } else {
        if (divisionId !== division) {
          throw new NotFoundError("Divisi tidak sesuai");
        }
      }

      const filename = await this._storageService.writeFile(
        documentFile,
        documentFile.hapi
      );
      const id = await this._documentService.addDocument(
        credentialId,
        unitId,
        divisionId,
        title,
        description,
        filename,
        isPublic
      );

      let userCollaborationList = [credentialId];

      if (
        userCollabsId &&
        Array.isArray(userCollabsId) &&
        userCollabsId.length > 0
      ) {
        userCollaborationList = [...userCollabsId, credentialId];
      }

      await this._documentCollaborationService.addDocumentCollaborationByUser(
        id,
        userCollaborationList
      );

      if (
        unitCollabsIds &&
        Array.isArray(unitCollabsIds) &&
        unitCollabsIds.length > 0
      ) {
        await this._documentCollaborationService.addDocumentCollaborationByUnit(
          id,
          unitCollabsIds
        );
      }

      if (
        divisionCollabsIds &&
        Array.isArray(divisionCollabsIds) &&
        divisionCollabsIds.length > 0
      ) {
        await this._documentCollaborationService.addDocumentCollaborationByDivision(
          id,
          divisionCollabsIds
        );
      }

      const response = h.response({
        status: "success",
        message: "Document berhasil diunggah",
        data: {
          fileLocation: `${filename}`,
        },
      });
      response.code(201);
      return response;
    } catch (error) {
      console.error(error);
    }
  }

  async uploadBulkDocumentsFromExcel(request, h) {
    try {
      const { documentFile } = request.payload;
      const { id: credentialId } = request.auth.credentials;
      // Load and validate the Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(documentFile._data);

      const sheet = workbook.getWorksheet(1); // Assuming data is in the first sheet
      const rows = sheet.getSheetValues();
      for (let i = 2; i <= rows.length - 1; i++) {
        console.log(`rows: ${JSON.stringify(rows[i])}`);
        const [temp, unit, div, docTitle, docDescription, fileName] = rows[i];
        console.log(
          `unit ${unit} div ${div} docTitle ${docTitle} docDesc ${docDescription} filename ${fileName}`
        );

        if (!unit || !div || !docTitle || !docDescription || !fileName) {
          console.warn(`Skipping row ${i}: Missing required data`);
          continue; // Skip rows with missing data
        }

        // Fetch unit and division data
        const division = await this._unitService.getUnitById(unit);
        if (!division || div !== division) {
          console.warn(`Skipping row ${i}: Unit atau Divisi tidak sesuai`);
          continue; // Skip rows with invalid unit/division
        }

        console.log(`dirName: ${__dirname}`);
        console.log(`filename: ${fileName}`);
        const filePath = ``;
        console.log(`filePath: ${filePath}`);
        if (!fs.existsSync(filePath)) {
          console.warn(
            `Skipping row ${i}: File PDF ${filePath} tidak ditemukan`
          );
          continue; // Skip rows with missing PDF files
        }

        const readStream = fs.createReadStream(filePath);
        console.log(`Creating read stream for: ${filePath}`);
        const filename = await this._storageService.writeFileBulk(
          readStream,
          fileName
        );
        console.log(`Uploaded file name: ${filename}`); // Check the filename returned
        const id = await this._documentService.addDocument(
          credentialId,
          unit,
          div,
          docTitle,
          docDescription,
          filename
        );

        await this._documentCollaborationService.addDocumentCollaborationByUser(
          id,
          [credentialId]
        );
      }
      const response = h.response({
        status: "success",
        message: "Dokumen berhasil diunggah",
      });
      response.code(201);
      return response;
    } catch (error) {
      console.error(error);
      const response = h.response({
        status: "fail",
        message: error.message || "Terjadi kesalahan saat mengunggah dokumen",
      });
      response.code(error.statusCode || 500);
      return response;
    }
  }
  async getDocumentHandler(request, h) {
    this._validator.validateGetDocuments(request.params);

    const id = request.auth.credentials.id;
    const user = await this._usersService.getUserById(id);
    const unit_id = user[0].unit_id;
    const division_id = user[0].division_id;
    const validUnitId = unit_id != null ? unit_id : "";
    const validDivisionId = division_id != null ? division_id : "";
    const data = await this._documentService.getDocuments(
      validDivisionId,
      validUnitId,
      id
    );
    return {
      status: "success",
      data,
    };
  }
}

module.exports = DocumentHandler;
