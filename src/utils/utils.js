const moment = require("moment-timezone");

function getCurrentTimeInMakassar() {
  return moment().tz("Asia/Makassar").format("YYYY-MM-DD HH:mm:ss");
}

module.exports = { getCurrentTimeInMakassar };
