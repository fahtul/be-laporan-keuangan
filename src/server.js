// src/server.js
const Hapi = require("@hapi/hapi");
const Jwt = require("@hapi/jwt");
const Inert = require("@hapi/inert");
require("dotenv").config();

const knex = require("./database/knex");
const ClientError = require("./exceptions/ClientError");
const { logError } = require("./utils/logger");
const requireRole = require("./middlewares/requireRole");

const { createContainer } = require("./container");
const { registerPlugins } = require("./container/registerPlugins");

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT,
    host: process.env.HOST,
  });

  // 0) Register base plugins
  await server.register([{ plugin: Jwt }, { plugin: Inert }]);

  // 1) BFF JWT auth (wajib sebelum register routes yang mau pakai default auth)
  server.auth.strategy("bff_jwt", "jwt", {
    keys: process.env.BFF_JWT_KEY,
    verify: {
      aud: "finance-api",
      iss: "laravel-bff",
      sub: false,
      maxAgeSec: 300,
      timeSkewSec: 0, // biar test expiry ketat (boleh 5 di production)
    },
    validate: async (artifacts) => {
      const p = artifacts.decoded.payload;

      // expected payload: { actorId, organizationId, role, fullname, email, iat, exp, aud, iss }
      if (!p.actorId || !p.organizationId || !p.role) return { isValid: false };

      // ✅ hard block
      if (p.isActive === false) return { isValid: false };

      return {
        isValid: true,
        credentials: {
          id: p.actorId,
          organizationId: p.organizationId,
          role: p.role,
          fullname: p.fullname || null,
          email: p.email || null,
          isActive: p.isActive !== false,
        },
      };
    },
  });

  server.auth.default("bff_jwt");

  // 2) Upsert actor into finance DB (so audit FK works)
  server.ext("onPreHandler", async (request, h) => {
    if (!request.auth?.isAuthenticated) return h.continue;

    const {
      id: actorId,
      organizationId,
      role,
      fullname,
      email,
      isActive,
    } = request.auth.credentials;

    const roleRow = await knex("roles")
      .select("id")
      .where({ name: role })
      .first();
    if (!roleRow) {
      return h.response({ status: "fail", message: "Invalid role" }).code(403);
    }

    const active = isActive !== false; // ✅ default true

    await knex("users")
      .insert({
        id: actorId,
        organization_id: organizationId,
        role_id: roleRow.id,
        fullname: fullname || "Unknown",
        email: email || `${actorId}@local`,
        password_hash: "BFF_ONLY",
        is_active: active, // ✅ mirror
      })
      .onConflict("id")
      .merge({
        organization_id: organizationId,
        role_id: roleRow.id,
        fullname: fullname || "Unknown",
        email: email || `${actorId}@local`,
        is_active: active, // ✅ mirror
        updated_at: knex.fn.now(),
      });

    return h.continue;
  });

  // 3) Error formatting (ClientError + InternalError)
  server.ext("onPreResponse", (request, h) => {
    const { response } = request;

    if (response instanceof ClientError) {
      return h
        .response({ status: "fail", message: response.message })
        .code(response.statusCode);
    }

    if (response instanceof Error) {
      const statusCode = response.output?.statusCode || 500;

      logError(
        `❗ ${request.method.toUpperCase()} ${request.path} - Internal Error`,
        response
      );

      const isProd = process.env.NODE_ENV === "production";
      return h
        .response({
          status: "error",
          message: isProd
            ? "Internal Server Error"
            : response.message || "Internal Server Error",
        })
        .code(statusCode);
    }

    return h.continue;
  });

  // 4) Create container (singleton services) + register domain plugins
  const container = createContainer();
  await registerPlugins(server, container);

  // 5) Debug endpoints (auth required by default)
  server.route({
    method: "GET",
    path: "/v1/me",
    handler: (request, h) => {
      return h.response({ status: "success", data: request.auth.credentials });
    },
  });

  server.route({
    method: "GET",
    path: "/env-check",
    options: { auth: false },
    handler: () => ({ hasBffKey: !!process.env.BFF_JWT_KEY }),
  });

  server.route({
    method: "GET",
    path: "/v1/auth-check",
    handler: () => ({ status: "success" }),
  });

  server.route({
    method: "GET",
    path: "/v1/rbac/admin-only",
    handler: () => ({ status: "success", message: "ok admin" }),
    options: { pre: [requireRole(["admin"])] },
  });

  server.route({
    method: "POST",
    path: "/v1/audit-test",
    handler: async (request, h) => {
      const { id: actorId, organizationId } = request.auth.credentials;

      await knex("audit_logs").insert({
        organization_id: organizationId,
        actor_id: actorId,
        action: "auth.test",
        entity: "auth",
        entity_id: null,
        before: null,
        after: { ok: true },
        ip: request.info.remoteAddress,
        user_agent: request.headers["user-agent"],
      });

      return h.response({ status: "success" }).code(201);
    },
  });

  // 6) Health check without auth
  server.route({
    method: "GET",
    path: "/test",
    handler: () => ({ status: "success", message: "OK" }),
    options: { auth: false },
  });

  await server.start();
  console.log(`Server running at: ${server.info.uri}`);
};

init();
