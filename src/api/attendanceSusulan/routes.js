// src/api/attendanceSusulan/routes.js
const {
  CreateSusulanSchema,
  UpdateSusulanSchema,
} = require("../../validator/attendanceSusulan");

const routes = (handler) => [
  {
    method: "POST",
    path: "/attendance/susulan",
    handler: handler.postSusulanHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        payload: CreateSusulanSchema,
      },
    },
  },
  {
    method: "PUT",
    path: "/attendance/susulan/{id}",
    handler: handler.updateSusulanHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        payload: UpdateSusulanSchema,
      },
    },
  },
  {
    method: "GET",
    path: "/attendance/susulan",
    handler: handler.getSusulanHandler,
    options: {
      auth: "jims_jwt",
      description:
        "List susulan requests; admins see all, users see only their own",
    },
  },
];

module.exports = routes;
