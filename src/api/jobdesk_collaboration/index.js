const JobdeskCollaborationHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "jobdesksCollaboration",
  version: "1.0.0",
  register: async (
    server,
    {
      jobdeskService,
      jobdeskCollaborationService,
      userService,
      divisionService,
      unitService,
      validator,
    }
  ) => {
    const jobdeskCollaborationHandler = new JobdeskCollaborationHandler(
      jobdeskService,
      jobdeskCollaborationService,
      userService,
      divisionService,
      unitService,
      validator
    );
    server.route(routes(jobdeskCollaborationHandler));
  },
};
