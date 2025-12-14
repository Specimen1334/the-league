// apps/api/src/server.ts
import fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";

import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerLeagueRoutes } from "./routes/leagues";
import { registerTeamRoutes } from "./routes/teams";
import { registerDraftRoutes } from "./routes/draft";
import { registerMatchRoutes } from "./routes/matches";
import { registerMarketplaceRoutes } from "./routes/marketplace";
import { registerPokedexRoutes } from "./routes/pokedex";
import { registerInboxRoutes } from "./routes/inbox";
import { registerAdminRoutes } from "./routes/admin";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerHealthRoutes } from "./routes/health";
import { registerBootstrapRoutes } from "./routes/bootstrap";

import { registerSeasonBaseRoutes } from "./routes/seasons/seasons.base";
import { registerSeasonMatchesRoutes } from "./routes/seasons/seasons.matches";
import { registerSeasonStandingsRoutes } from "./routes/seasons/seasons.standings";

import { sessionsRepo } from "./modules/auth/sessions.repo";
import {
  createRequireAuthHook,
  createRequireSuperAdminHook
} from "./shared/permissions";
import type { AppUser } from "./shared/types";
const SESSION_COOKIE_NAME = "sid";

export async function buildServer(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true
  });

  // Cookies (for sessions)
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || "dev-secret",
    parseOptions: {}
  });

  await app.register(cors, {
    origin: true,        // echo back the request origin
    credentials: true    // allow cookies / Authorization headers
  });
  
  // Global hook: hydrate request.user from session cookie if present
  app.addHook("preHandler", async (request, _reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionId) return;

    const result = sessionsRepo.getSessionWithUser(sessionId);
    if (!result) {
      return;
    }

    const { user } = result;
    (request as any).user = user as AppUser;
    (request as any).sessionId = sessionId;
  });

  const requireAuth = createRequireAuthHook();
  const requireSuperAdmin = createRequireSuperAdminHook();

  // ───────────────────────────
  // Public / auth routes
  // ───────────────────────────
  registerHealthRoutes(app);
  registerBootstrapRoutes(app);
  registerAuthRoutes(app);

  // ───────────────────────────
  // Core user-facing routes
  // ───────────────────────────
  registerUserRoutes(app, { requireAuth });
  registerLeagueRoutes(app, { requireAuth });
  registerTeamRoutes(app, { requireAuth });
  registerDraftRoutes(app, { requireAuth });
  registerMatchRoutes(app, { requireAuth });
  registerMarketplaceRoutes(app, { requireAuth });
  registerPokedexRoutes(app, { requireAuth });
  registerInboxRoutes(app, { requireAuth });
  registerDashboardRoutes(app, { requireAuth });

  // ───────────────────────────
  // Season-scoped routes (per design: seasons hub & sub-views)
  // ───────────────────────────
  registerSeasonBaseRoutes(app, { requireAuth });
  registerSeasonMatchesRoutes(app, { requireAuth });
  registerSeasonStandingsRoutes(app, { requireAuth });

  // ───────────────────────────
  // Admin / Control Room
  // ───────────────────────────
  registerAdminRoutes(app, { requireSuperAdmin });

  return app;
}

// If this file is run directly via ts-node-dev or Node, start the server
if (require.main === module) {
  (async () => {
    const app = await buildServer();
    const port = Number(process.env.PORT || 4000);
    const host = process.env.HOST || "0.0.0.0";

    try {
      await app.listen({ port, host });
      app.log.info(`API listening on http://${host}:${port}`);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  })();
}
