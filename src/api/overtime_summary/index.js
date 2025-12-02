const OvertimeHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "overtime",
  version: "1.0.0",
  register: async (server, { overtimeService, validator }) => {
    // accept either a validator *instance* or a *class*
    const v =
      validator && typeof validator === "function"
        ? new validator()
        : validator;

    const overtimeHandler = new OvertimeHandler(overtimeService, v);
    server.route(routes(overtimeHandler));
  },
};
