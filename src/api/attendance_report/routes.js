const Joi = require("joi");

const routes = (handler) => [
  // {
  //   method: "GET",
  //   path: "/attendance-reports",
  //   handler: handler.getMonthlyReportHandler,
  //   options: {
  //     auth: "jims_jwt",
  //     validate: {
  //       query: Joi.object({
  //         userId: Joi.string().required(),
  //         year: Joi.number().integer().min(2000).required(),
  //         month: Joi.number().integer().min(1).max(12).required(),
  //         status: Joi.string().optional(),
  //       }),
  //       // so you see exactly which field failed validation:
  //       failAction: (request, h, err) => {
  //         throw err;
  //       },
  //     },
  //   },
  // },
  // === Daily team attendance (dynamic schedule) ===
  {
    method: "GET",
    path: "/attendance-reports/daily-team",
    handler: handler.getDailyTeamAttendanceHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        query: Joi.object({
          date: Joi.date().iso().required(), // YYYY-MM-DD
          onlyUserIds: Joi.alternatives()
            .try(
              Joi.array().items(Joi.string()), // ?onlyUserIds[]=u1&onlyUserIds[]=u2
              Joi.string() // or single string, comma-separated
            )
            .optional(),
        }),
        failAction: (request, h, err) => {
          throw err;
        },
      },
    },
  },

  {
    method: "GET",
    path: "/attendance-reports",
    handler: handler.getMonthlyReportHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        query: Joi.object({
          userId: Joi.string().required(),
          year: Joi.number().integer().min(2000).required(),
          month: Joi.number().integer().min(1).max(12).required(),
          status: Joi.string().optional(), // 'present' | 'on_time' | 'late_in' | etc
        }),
        failAction: (request, h, err) => {
          throw err;
        },
      },
    },
  },
  {
    method: "GET",
    path: "/attendance-reports/export",
    handler: handler.exportMonthlyReportHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        query: Joi.object({
          userId: Joi.string().required(),
          year: Joi.number().integer().min(2000).required(),
          month: Joi.number().integer().min(1).max(12).required(),
          status: Joi.string().optional(),
        }),
        failAction: (request, h, err) => {
          throw err;
        },
      },
    },
  },

  {
    method: "GET",
    path: "/attendance-reports/export-all",
    handler: handler.exportAllMonthlyReportHandler,
    options: {
      auth: "jims_jwt",
      validate: {
        query: Joi.object({
          year: Joi.number().integer().min(2000).required(),
          month: Joi.number().integer().min(1).max(12).required(),
        }),
        failAction: (request, h, err) => {
          throw err;
        },
      },
    },
  },
];

module.exports = routes;
