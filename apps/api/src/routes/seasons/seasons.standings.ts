// apps/api/src/routes/seasons/seasons.standings.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../../shared/permissions";
import { seasonStandingsService } from "../../modules/seasons/seasons.standings";
import { seasonsService } from "../../modules/seasons/seasons.service";
import { toErrorResponse } from "../../shared/errors";
import type {
  SeasonStandingsQuery,
  SeasonStandingsResponse,
  SeasonStandingsRecalculateResponse
} from "../../modules/seasons/seasons.schemas";

export function registerSeasonStandingsRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // GET /seasons/:seasonId/standings – ladder / table for the season
  app.get<{
    Params: { seasonId: string };
    Querystring: SeasonStandingsQuery;
    Reply: SeasonStandingsResponse;
  }>(
    "/seasons/:seasonId/standings",
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
        const standings = seasonStandingsService.getSeasonStandings(
          seasonId,
          user,
          request.query ?? {}
        );
        reply.send(standings);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/standings/recalculate – commissioner/owner recompute standings
  app.post<{
    Params: { seasonId: string };
    Reply: SeasonStandingsRecalculateResponse;
  }>(
    "/seasons/:seasonId/standings/recalculate",
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
        const result = seasonsService.recalculateStandings(seasonId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
