const path = require("path");
const fs = require("fs");

const logError = (message, error) => {
  const logPath = path.resolve(__dirname, "../../logs/error.log");
  const fullMessage = `[${new Date().toISOString()}] ${message}\n${
    error?.stack || error
  }\n\n`;

  if (!fs.existsSync(path.dirname(logPath))) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  fs.appendFileSync(logPath, fullMessage);
};

module.exports = { logError };
