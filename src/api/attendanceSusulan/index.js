// src/api/attendance_susulan/index.js

const AttendanceSusulanHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "attendance_susulan",
  version: "1.0.0",
  register: async (server, { service,usersService, validator }) => {
    const attendanceSusulanHandler = new AttendanceSusulanHandler(
      service,
      usersService,
      validator
    );
    server.route(routes(attendanceSusulanHandler));
  },
};
