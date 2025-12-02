const AddAbsentHandler = require("./AddAbsentHandler");
const routes = require("./routes");

module.exports = {
  name: "addAbsent",
  version: "1.0.0",
  register: async (
    server,
    { addAbsentService, validator }
  ) => {
    const addAbsentHandler = new AddAbsentHandler(
      addAbsentService,
      validator
    );
    server.route(routes(addAbsentHandler));
  },
};
