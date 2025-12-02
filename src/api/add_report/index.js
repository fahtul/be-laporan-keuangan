const AddReportHandler = require("./AddReportHandler");
const routes = require("./routes");

module.exports = {
  name: "addReports",
  version: "1.0.0",
  register: async (
    server,
    { addReportService, storageService, usersService, validator }
  ) => {
    const addReportHandler = new AddReportHandler(
      addReportService,
      storageService,
      usersService,
      validator
    );
    server.route(routes(addReportHandler));
  },
};
