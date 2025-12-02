const Joi = require("joi");

const routes = (handler) => [
  {
    method: "POST",
    path: "/schedule-categories",
    handler: handler.createCategoryHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/schedule-categories",
    handler: handler.getAllCategoriesHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/schedule-categories/{id}",
    handler: handler.getCategoryByIdHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/schedule-categories/{id}",
    handler: handler.updateCategoryHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/schedule-categories/{id}",
    handler: handler.deleteCategoryHandler,
    options: { auth: "jims_jwt" },
  },

  {
    method: "POST",
    path: "/user-schedules/monthly-assign",
    handler: handler.assignSchedulesHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/user-schedules",
    handler: handler.getUserSchedulesHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "DELETE",
    path: "/user-schedules/{user_id}/{date}",
    handler: handler.deleteUserScheduleHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "PUT",
    path: "/user-schedules/{user_id}/{date}",
    handler: handler.upsertUserScheduleHandler,
    options: { auth: "jims_jwt" },
  },
  {
    method: "POST",
    path: "/user-schedules/upsert",
    handler: async (request, h) => {
      // accepts { user_id, date, category_id }
      const { user_id, date, category_id } = request.payload || {};
      if (!user_id || !date || !category_id) {
        throw new InvariantError("user_id, date, and category_id are required");
      }
      const result = await handler._service.upsertUserSchedule({
        user_id,
        date,
        category_id,
      });
      return {
        status: "success",
        message: `Jadwal ${result.action}`,
        data: { id: result.id },
      };
    },
    options: { auth: "jims_jwt" },
  },
  {
    method: "GET",
    path: "/user-schedules/{id}/date/{date}",
    handler: handler.getScheduleForDateHandler.bind(handler),
    options: {
      auth: "jims_jwt",
      description: "Get schedule for a user for a specific date",
      validate: {
        params: Joi.object({
          id: Joi.string().required(),
          date: Joi.string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .required(),
        }),
      },
    },
  },
];

module.exports = routes;
