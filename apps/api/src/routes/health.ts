// apps/api/src/routes/health.ts
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    reply.send({
      ok: true,
      status: "healthy",
      now: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  });
}
