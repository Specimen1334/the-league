// apps/api/src/routes/dashboard.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { toErrorResponse } from "../shared/errors";
import { dashboardService } from "../modules/dashboard/dashboard.service";
import type { DashboardResponse } from "../modules/dashboard/dashboard.schemas";

export function registerDashboardRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  app.get<{
    Reply: DashboardResponse;
  }>(
    "/dashboard",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const data = dashboardService.getDashboard(user);
        reply.send(data);
      } catch (err: any) {
        // 🔍 NEW: log the full error so you can see it in the API console
        app.log.error(
          {
            err,
            route: "/dashboard"
          },
          "Dashboard route failed"
        );

        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
