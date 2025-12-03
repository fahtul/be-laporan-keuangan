const RequestsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "requests",
  version: "1.0.0",
  register: async (
    server,
    {
      service,
      usersService,
      validator,
      storageService,
      fcmService,
      emailService,
      newWorkScheduleService,
    }
  ) => {
    // Pastikan urutan argumen sama dengan constructor di handler.js
    const requestsHandler = new RequestsHandler(
      service,
      usersService,
      validator,
      storageService, // kirim storageService di sini
      fcmService,
      emailService,
      newWorkScheduleService
    );
    server.route(routes(requestsHandler));
  },
};
