// apps/api/src/routes/seasons/seasons.base.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../../shared/permissions";
import { seasonsService } from "../../modules/seasons/seasons.service";
import { toErrorResponse } from "../../shared/errors";
import type {
  SeasonUpdateBody,
  SeasonOverviewResponse,
  SeasonTeamsResponse,
  SeasonSettingsResponse,
  UpdateSeasonSettingsBody
} from "../../modules/seasons/seasons.schemas";

export function registerSeasonBaseRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // GET /seasons/:seasonId – Season hub overview
  app.get<{
    Params: { seasonId: string };
    Reply: SeasonOverviewResponse;
  }>(
    "/seasons/:seasonId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          } as any);
          return;
        }

        const user = request.user!;
        const overview = seasonsService.getSeasonOverview(seasonId, user);
        reply.send(overview);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // PATCH /seasons/:seasonId – commissioner/owner update of season meta & status
  app.patch<{
    Params: { seasonId: string };
    Body: SeasonUpdateBody;
    Reply: SeasonOverviewResponse;
  }>(
    "/seasons/:seasonId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          } as any);
          return;
        }

        const user = request.user!;
        const updated = seasonsService.updateSeason(seasonId, user, request.body);
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/teams – Season team list for hub (with managers, records)
  app.get<{
    Params: { seasonId: string };
    Reply: SeasonTeamsResponse;
  }>(
    "/seasons/:seasonId/teams",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          } as any);
          return;
        }

        const user = request.user!;
        const teams = seasonsService.getSeasonTeams(seasonId, user);
        reply.send(teams);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/settings – season-scoped config (draft/trades)
  app.get<{
    Params: { seasonId: string };
    Reply: SeasonSettingsResponse;
  }>(
    "/seasons/:seasonId/settings",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          } as any);
          return;
        }

        const user = request.user!;
        const result = seasonsService.getSeasonSettings(seasonId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // PATCH /seasons/:seasonId/settings – owner/commissioner update of season settings
  app.patch<{
    Params: { seasonId: string };
    Body: UpdateSeasonSettingsBody;
    Reply: SeasonSettingsResponse;
  }>(
    "/seasons/:seasonId/settings",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId"
          } as any);
          return;
        }

        const user = request.user!;
        const result = seasonsService.updateSeasonSettings(seasonId, user, request.body ?? {});
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
