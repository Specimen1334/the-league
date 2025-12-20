// apps/api/src/routes/admin.ts
import type { FastifyInstance } from "fastify";
import type { RequireSuperAdminHook } from "../shared/permissions";
import { adminService } from "../modules/admin/admin.service";
import { importPbsZipToDex } from "../modules/pokedex/pokedexImport.service";
import {
  normalizeAdminListQuery,
  type AdminListQuery,
  type AdminUpdateUserBody,
  type AdminUpdateLeagueBody,
  type AdminUpdateSeasonBody,
  type AdminUpdateTeamBody,
  type AdminUpdateMatchBody,
  type AdminUpdateFeatureFlagBody
} from "../modules/admin/admin.schemas";
import { toErrorResponse } from "../shared/errors";

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: { requireSuperAdmin: RequireSuperAdminHook }
) {
  const { requireSuperAdmin } = deps;

  // ───────────────────────────
  // Overview / Control Room
  // ───────────────────────────

  app.get(
    "/admin",
    { preHandler: requireSuperAdmin },
    async (_request, reply) => {
      try {
        const summary = adminService.getOverviewSummary();
        reply.send(summary);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Users
  // ───────────────────────────

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/users",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const query = normalizeAdminListQuery(request.query ?? {});
        const paged = adminService.listUsers({
          ...request.query,
          page: query.page,
          limit: query.limit
        });
        reply.send(paged);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{
    Params: { userId: string };
    Body: AdminUpdateUserBody;
  }>(
    "/admin/users/:userId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.userId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid userId"
          });
          return;
        }

        const updated = adminService.updateUser(id, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.delete<{ Params: { userId: string } }>(
    "/admin/users/:userId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.userId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid userId"
          });
          return;
        }

        adminService.deleteUser(id);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Leagues
  // ───────────────────────────

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/leagues",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const query = normalizeAdminListQuery(request.query ?? {});
        const paged = adminService.listLeagues({
          ...request.query,
          page: query.page,
          limit: query.limit
        });
        reply.send(paged);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{
    Params: { leagueId: string };
    Body: AdminUpdateLeagueBody;
  }>(
    "/admin/leagues/:leagueId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.leagueId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId"
          });
          return;
        }

        const updated = adminService.updateLeague(id, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.delete<{ Params: { leagueId: string } }>(
    "/admin/leagues/:leagueId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.leagueId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId"
          });
          return;
        }

        adminService.deleteLeague(id);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Seasons
  // ───────────────────────────

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/seasons",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const query = normalizeAdminListQuery(request.query ?? {});
        const paged = adminService.listSeasons({
          ...request.query,
          page: query.page,
          limit: query.limit
        });
        reply.send(paged);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{
    Params: { seasonId: string };
    Body: AdminUpdateSeasonBody;
  }>(
    "/admin/seasons/:seasonId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.seasonId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          });
          return;
        }

        const updated = adminService.updateSeason(id, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.delete<{ Params: { seasonId: string } }>(
    "/admin/seasons/:seasonId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.seasonId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          });
          return;
        }

        adminService.deleteSeason(id);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Teams
  // ───────────────────────────

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/teams",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const query = normalizeAdminListQuery(request.query ?? {});
        const paged = adminService.listTeams({
          ...request.query,
          page: query.page,
          limit: query.limit
        });
        reply.send(paged);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{
    Params: { teamId: string };
    Body: AdminUpdateTeamBody;
  }>(
    "/admin/teams/:teamId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.teamId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid teamId"
          });
          return;
        }

        const updated = adminService.updateTeam(id, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.delete<{ Params: { teamId: string } }>(
    "/admin/teams/:teamId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.teamId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid teamId"
          });
          return;
        }

        adminService.deleteTeam(id);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Matches
  // ───────────────────────────

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/matches",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const query = normalizeAdminListQuery(request.query ?? {});
        const paged = adminService.listMatches({
          ...request.query,
          page: query.page,
          limit: query.limit
        });
        reply.send(paged);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{
    Params: { matchId: string };
    Body: AdminUpdateMatchBody;
  }>(
    "/admin/matches/:matchId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.matchId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          });
          return;
        }

        const updated = adminService.updateMatch(id, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.delete<{ Params: { matchId: string } }>(
    "/admin/matches/:matchId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const id = Number(request.params.matchId);
        if (!Number.isInteger(id) || id <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          });
          return;
        }

        adminService.deleteMatch(id);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Importers
  // ───────────────────────────

  app.post(
    "/admin/pokedex/import-pbs",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const qs = (request.query ?? {}) as any;
        // Accept both boolean-ish strings and 1/0 from query params
        const dryRunRaw = String(qs.dryRun ?? "false").toLowerCase();
        const dryRun = dryRunRaw === "true" || dryRunRaw === "1";
        const sourceTag = typeof qs.sourceTag === "string" && qs.sourceTag.trim().length > 0
          ? qs.sourceTag.trim()
          : "pbs";

        const file = await (request as any).file();
        if (!file) {
          reply.code(400).send({ error: "BadRequest", message: "Missing file upload" });
          return;
        }

        const buf = await file.toBuffer();
        const report = importPbsZipToDex({ buffer: buf, dryRun, sourceTag });
        reply.send(report);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Feature flags
  // ───────────────────────────

  app.get(
    "/admin/config/features",
    { preHandler: requireSuperAdmin },
    async (_request, reply) => {
      try {
        const flags = adminService.listFeatureFlags();
        reply.send({ features: flags });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{ Body: AdminUpdateFeatureFlagBody }>(
    "/admin/config/features",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      try {
        const flag = adminService.updateFeatureFlag(request.body);
        reply.send(flag);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

}
