// apps/api/src/routes/seasons/seasons.matches.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../../shared/permissions";
import { matchesService } from "../../modules/matches/matches.service";
import { toErrorResponse } from "../../shared/errors";
import type {
  SeasonMatchesQuery,
  SeasonMatchesResponse,
  SeasonMatchCalendarQuery,
  SeasonMatchCalendarResponse,
  GenerateSeasonMatchesBody,
  CreateMatchBody,
  ImportMatchesBody,
  MatchUpdateBody
} from "../../modules/matches/matches.schemas";

export function registerSeasonMatchesRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // GET /seasons/:seasonId/matches – list/filter matches for a season
  app.get<{
    Params: { seasonId: string };
    Querystring: SeasonMatchesQuery;
    Reply: SeasonMatchesResponse;
  }>(
    "/seasons/:seasonId/matches",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = matchesService.listSeasonMatches(
          request.params.seasonId,
          user,
          request.query ?? {}
        );
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/matches/calendar – grouped calendar view
  app.get<{
    Params: { seasonId: string };
    Querystring: SeasonMatchCalendarQuery;
    Reply: SeasonMatchCalendarResponse;
  }>(
    "/seasons/:seasonId/matches/calendar",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const calendar = matchesService.getSeasonMatchCalendar(
          request.params.seasonId,
          user,
          request.query ?? {}
        );
        reply.send(calendar);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/matches/generate – generate schedule (commissioner)
  app.post<{
    Params: { seasonId: string };
    Body: GenerateSeasonMatchesBody;
  }>(
    "/seasons/:seasonId/matches/generate",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = matchesService.generateSeasonMatches(
          request.params.seasonId,
          user,
          request.body ?? {}
        );
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/matches – manually create a match (commissioner)
  app.post<{
    Params: { seasonId: string };
    Body: CreateMatchBody;
  }>(
    "/seasons/:seasonId/matches",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const created = matchesService.createMatch(
          request.params.seasonId,
          user,
          request.body
        );
        reply.send(created);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/matches/import – bulk import matches (commissioner)
  app.post<{
    Params: { seasonId: string };
    Body: ImportMatchesBody;
  }>(
    "/seasons/:seasonId/matches/import",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = matchesService.importMatches(
          request.params.seasonId,
          user,
          request.body
        );
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // PATCH /seasons/:seasonId/matches/:matchId – update schedule/status (commissioner)
  app.patch<{
    Params: { seasonId: string; matchId: string };
    Body: MatchUpdateBody;
  }>(
    "/seasons/:seasonId/matches/:matchId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const updated = matchesService.updateMatch(
          request.params.seasonId,
          request.params.matchId,
          user,
          request.body
        );
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
