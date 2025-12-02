// src/api/leaves/index.js

const LeaveRequestsService = require("../../services/mssql/LeaveRequestsService");
const LeaveRequestsValidator = require("../../validator/leaves");
const LeaveRequestsHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "leaves",
  version: "1.0.0",
  register: async (server) => {
    // 1) Instantiate your service
    const service = new LeaveRequestsService();

    // 2) Use the validator you exported (not the handler)
    const validator = LeaveRequestsValidator;

    // 3) Now create your handler with service + validator
    const handler = new LeaveRequestsHandler(service, validator);

    // 4) Wire up all the routes
    server.route(routes(handler));
  },
};
