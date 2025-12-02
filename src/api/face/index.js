const FaceHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "face",
  version: "1.0.0",
  register: async (server, { service, validator }) => {
    const faceHandler = new FaceHandler(service, validator);
    server.route(routes(faceHandler));
  },
};
