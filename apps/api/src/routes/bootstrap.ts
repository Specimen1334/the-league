// apps/api/src/routes/bootstrap.ts
import type { FastifyInstance } from "fastify";
import { createHttpError, toErrorResponse } from "../shared/errors";
import { usersRepo } from "../modules/users/users.repo";

type BootstrapSuperAdminBody = {
  userId?: number;
  username?: string;
  email?: string;
};

/**
 * One-time bootstrap route for promoting a user to superadmin.
 *
 * Security:
 * - Only enabled when BOOTSTRAP_ADMIN_TOKEN is set.
 * - Requires header: x-bootstrap-token: <token>
 */
export function registerBootstrapRoutes(app: FastifyInstance) {
  app.post<{ Body: BootstrapSuperAdminBody }>(
    "/admin/bootstrap/superadmin",
    async (request, reply) => {
      try {
        const token = process.env.BOOTSTRAP_ADMIN_TOKEN;
        if (!token) {
          throw createHttpError(
            404,
            "Bootstrap route not enabled",
            "NotFound"
          );
        }

        const headerToken = String(request.headers["x-bootstrap-token"] ?? "");
        if (!headerToken || headerToken !== token) {
          throw createHttpError(401, "Invalid bootstrap token", "Unauthorized");
        }

        const { userId, username, email } = request.body ?? {};

        let row = null as ReturnType<typeof usersRepo.findById>;
        if (typeof userId === "number") {
          row = usersRepo.findById(userId);
        } else if (typeof username === "string" && username.trim()) {
          row = usersRepo.findByUsername(username.trim());
        } else if (typeof email === "string" && email.trim()) {
          row = usersRepo.findByEmail(email.trim());
        } else {
          throw createHttpError(
            400,
            "Provide userId, username, or email",
            "BadRequest"
          );
        }

        if (!row) {
          throw createHttpError(404, "User not found", "NotFound");
        }

        const updated = usersRepo.updateRoleAndEnable(row.id, "superadmin");
        if (!updated) {
          throw createHttpError(500, "Failed to promote user", "Internal");
        }

        reply.send({
          ok: true,
          user: {
            id: updated.id,
            username: updated.username,
            role: updated.role
          }
        });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
