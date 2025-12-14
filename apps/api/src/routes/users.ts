// apps/api/src/routes/users.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { usersService } from "../modules/users/users.service";
import { toErrorResponse } from "../shared/errors";
import type {
  UpdateMeBody,
  UpdateSettingsBody,
  ChangePasswordBody
} from "../modules/users/users.schemas";

export function registerUserRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // GET /users/me – full profile for current user
  app.get("/users/me", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const user = request.user!;
      const profile = usersService.getProfileForSelf(user);
      reply.send(profile);
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

  // GET /me – alias for frontend convenience
  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const user = request.user!;
      const profile = usersService.getProfileForSelf(user);
      reply.send(profile);
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

  // GET /me/roles – minimal auth context for UI gating
  app.get("/me/roles", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const user = request.user!;
      reply.send({
        userId: user.id,
        role: user.role,
        isSuperAdmin: user.role === "superadmin",
        isCommissioner: user.role === "commissioner" || user.role === "superadmin"
      });
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

  // PATCH /users/me – update profile (display name, avatar, bio, etc.)
  app.patch<{ Body: UpdateMeBody }>(
    "/users/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const updated = usersService.updateMe(user, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /users/me/settings
  app.get("/users/me/settings", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const user = request.user!;
      const settings = usersService.getSettings(user);
      reply.send({ settings });
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

  // PATCH /users/me/settings
  app.patch<{ Body: UpdateSettingsBody }>(
    "/users/me/settings",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const settings = usersService.updateSettings(user, request.body);
        reply.send({ settings });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /users/me/change-password
  app.post<{ Body: ChangePasswordBody }>(
    "/users/me/change-password",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        await usersService.changePassword(user, request.body);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /users/me/sessions/logout-all
  app.post(
    "/users/me/sessions/logout-all",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        await usersService.logoutAllSessions(user);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /users/:userId – public profile (email withheld)
  app.get<{
    Params: { userId: string };
  }>("/users/:userId", async (request, reply) => {
    try {
      const id = Number(request.params.userId);
      if (!Number.isInteger(id) || id <= 0) {
        reply.code(400).send({
          error: "BadRequest",
          message: "Invalid userId"
        });
        return;
      }

      const profile = usersService.getPublicProfile(id);
      reply.send(profile);
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });
}
