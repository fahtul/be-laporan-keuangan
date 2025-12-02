const ReportHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "reports",
  version: "1.0.0",
  register: async (
    server,
    {
      reportService,
      storageService,
      usersService,
      fcmService,
      emailService,
      validator,
    }
  ) => {
    const reportHandler = new ReportHandler(
      reportService,
      storageService,
      usersService,
      fcmService,
      emailService,
      validator
    );
    server.route(routes(reportHandler));
  },
};
