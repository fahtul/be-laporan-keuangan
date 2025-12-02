const UserComponentValuesHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "userComponentValues",
  version: "1.0.0",
  register: async (server, { service, validator }) => {
    const handler = new UserComponentValuesHandler(service, validator);
    server.route(routes(handler));
  },
};
