const SalaryRulesService = require("../../services/mssql/SalaryRulesService");
const SalaryRuleValidator = require("../../validator/salaryRules");
const SalaryRulesHandler = require("./handler");
const routes = require("./routes");

module.exports = {
  name: "salary-rules",
  version: "1.0.0",
  register: async (server) => {
    const service = new SalaryRulesService();
    const validator = SalaryRuleValidator;
    const handler = new SalaryRulesHandler(service, validator);

    server.route(routes(handler));
  },
};
