const AuthorizationError = require("../exceptions/AuthorizationError");

const requireRole = (roles) => (request, h) => {
  const role = request.auth.credentials.role;
  if (!roles.includes(role)) throw new AuthorizationError("Forbidden");
  return h.continue;
};

module.exports = requireRole;
