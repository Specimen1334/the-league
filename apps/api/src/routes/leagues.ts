// apps/api/src/routes/leagues.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { leaguesService } from "../modules/leagues/leagues.service";
import { toErrorResponse } from "../shared/errors";
import type {
  CreateLeagueBody,
  UpdateLeagueBody,
  DiscoverLeaguesQuery,
  JoinLeagueBody
} from "../modules/leagues/leagues.schemas";
import type { CreateSeasonBody } from "../modules/seasons/seasons.schemas";

export function registerLeagueRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // GET /leagues – discover, optionally filtered
  app.get<{ Querystring: DiscoverLeaguesQuery }>(
    "/leagues",
    async (request, reply) => {
      try {
        const user = request.user ?? null;
        const result = leaguesService.discoverLeagues(user, request.query ?? {});
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /leagues/mine – current user's leagues
  app.get(
    "/leagues/mine",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const leagues = leaguesService.listMyLeagues(user);
        reply.send({ items: leagues });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /leagues – create league
  app.post<{ Body: CreateLeagueBody }>(
    "/leagues",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const league = await leaguesService.createLeague(user, request.body);
        reply.code(201).send(league);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /leagues/:leagueId – league hub overview (read-only)
  app.get<{ Params: { leagueId: string } }>(
    "/leagues/:leagueId",
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

        const user = request.user ?? null;
        const league = leaguesService.getLeagueDetail(id, user);
        reply.send(league);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // PATCH /leagues/:leagueId – owner/commissioner edit
  app.patch<{
    Params: { leagueId: string };
    Body: UpdateLeagueBody;
  }>(
    "/leagues/:leagueId",
    { preHandler: requireAuth },
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

        const user = request.user!;
        const league = await leaguesService.updateLeague(id, user, request.body);
        reply.send(league);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // DELETE /leagues/:leagueId – owner or superadmin (owner checked in service)
  app.delete<{ Params: { leagueId: string } }>(
    "/leagues/:leagueId",
    { preHandler: requireAuth },
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

        const user = request.user!;
        leaguesService.deleteLeague(id, user);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /leagues/:leagueId/members
  app.get<{ Params: { leagueId: string } }>(
    "/leagues/:leagueId/members",
    { preHandler: requireAuth },
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

        const user = request.user!;
        const members = leaguesService.listMembers(id, user);
        reply.send({ items: members });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /leagues/:leagueId/join
  app.post<{
    Params: { leagueId: string };
    Body: JoinLeagueBody;
  }>(
    "/leagues/:leagueId/join",
    { preHandler: requireAuth },
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

        const user = request.user!;
        const league = await leaguesService.joinLeague(id, user, request.body ?? {});
        reply.send(league);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /leagues/:leagueId/leave
  app.post<{ Params: { leagueId: string } }>(
    "/leagues/:leagueId/leave",
    { preHandler: requireAuth },
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

        const user = request.user!;
        leaguesService.leaveLeague(id, user);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /leagues/:leagueId/members/:userId/promote
  app.post<{ Params: { leagueId: string; userId: string } }>(
    "/leagues/:leagueId/members/:userId/promote",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const leagueId = Number(request.params.leagueId);
        const targetUserId = Number(request.params.userId);
        if (
          !Number.isInteger(leagueId) ||
          leagueId <= 0 ||
          !Number.isInteger(targetUserId) ||
          targetUserId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId or userId"
          });
          return;
        }

        const user = request.user!;
        const members = leaguesService.promoteMember(leagueId, user, targetUserId);
        reply.send({ items: members });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /leagues/:leagueId/members/:userId/demote
  app.post<{ Params: { leagueId: string; userId: string } }>(
    "/leagues/:leagueId/members/:userId/demote",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const leagueId = Number(request.params.leagueId);
        const targetUserId = Number(request.params.userId);
        if (
          !Number.isInteger(leagueId) ||
          leagueId <= 0 ||
          !Number.isInteger(targetUserId) ||
          targetUserId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId or userId"
          });
          return;
        }

        const user = request.user!;
        const members = leaguesService.demoteMember(leagueId, user, targetUserId);
        reply.send({ items: members });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // DELETE /leagues/:leagueId/members/:userId (kick)
  app.delete<{ Params: { leagueId: string; userId: string } }>(
    "/leagues/:leagueId/members/:userId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const leagueId = Number(request.params.leagueId);
        const targetUserId = Number(request.params.userId);
        if (
          !Number.isInteger(leagueId) ||
          leagueId <= 0 ||
          !Number.isInteger(targetUserId) ||
          targetUserId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId or userId"
          });
          return;
        }

        const user = request.user!;
        const members = leaguesService.kickMember(leagueId, user, targetUserId);
        reply.send({ items: members });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /leagues/:leagueId/seasons – league hub seasons list
  app.get<{ Params: { leagueId: string } }>(
    "/leagues/:leagueId/seasons",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const leagueId = Number(request.params.leagueId);
        if (!Number.isInteger(leagueId) || leagueId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId"
          });
          return;
        }

        const user = request.user!;
        const seasons = leaguesService.listSeasons(leagueId, user);
        reply.send({ items: seasons });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ✅ POST /leagues/:leagueId/seasons – create season inside league (owner/commissioner)
  app.post<{ Params: { leagueId: string }; Body: CreateSeasonBody }>(
    "/leagues/:leagueId/seasons",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const leagueId = Number(request.params.leagueId);
        if (!Number.isInteger(leagueId) || leagueId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid leagueId"
          });
          return;
        }

        const user = request.user!;
        const season = leaguesService.createSeason(leagueId, user, request.body);
        reply.code(201).send(season);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
