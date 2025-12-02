const JobdeskHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "jobdesks",
  version: "1.0.0",
  register: async (
    server,
    {
      jobdeskService,
      storageService,
      unitService,
      divisionService,
      usersService,
      jobdeskCollaborationService,
      validator,
    }
  ) => {
    const jobdeskHandler = new JobdeskHandler(
      jobdeskService,
      storageService,
      unitService,
      divisionService,
      usersService,
      jobdeskCollaborationService,
      validator
    );
    server.route(routes(jobdeskHandler));
  },
};
