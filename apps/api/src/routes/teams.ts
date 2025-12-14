// apps/api/src/routes/teams.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { teamsService } from "../modules/teams/teams.service";
import { lineupsService } from "../modules/teams/lineups.service";
import { toErrorResponse } from "../shared/errors";

import type {
  TeamHubOverviewResponse,
  TeamRosterResponse,
  TeamInventoryResponse,
  TeamMatchesResponse,
  JoinSeasonTeamBody,
  TransferTeamBody
} from "../modules/teams/teams.schemas";

import type {
  SetLineupBody,
  SetLineupResponse
} from "../modules/teams/lineups.schemas";

export function registerTeamRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // ───────────────────────────
  // Team Hub entry
  // ───────────────────────────

  // GET /seasons/:seasonId/teams/:teamId
  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: TeamHubOverviewResponse;
  }>(
    "/seasons/:seasonId/teams/:teamId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        const teamId = Number(request.params.teamId);
        if (
          !Number.isInteger(seasonId) ||
          seasonId <= 0 ||
          !Number.isInteger(teamId) ||
          teamId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId or teamId"
          } as any);
          return;
        }

        const user = request.user!;
        const overview = teamsService.getTeamHubOverview(seasonId, teamId, user);
        reply.send(overview);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Lineup & Roster
  // ───────────────────────────

  // GET /seasons/:seasonId/teams/:teamId/roster
  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: TeamRosterResponse;
  }>(
    "/seasons/:seasonId/teams/:teamId/roster",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        const teamId = Number(request.params.teamId);
        if (
          !Number.isInteger(seasonId) ||
          seasonId <= 0 ||
          !Number.isInteger(teamId) ||
          teamId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId or teamId"
          } as any);
          return;
        }

        const user = request.user!;
        const roster = teamsService.getTeamRoster(seasonId, teamId, user);
        reply.send(roster);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/teams/:teamId/lineup
  app.post<{
    Params: { seasonId: string; teamId: string };
    Body: SetLineupBody;
    Reply: SetLineupResponse;
  }>(
    "/seasons/:seasonId/teams/:teamId/lineup",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        const teamId = Number(request.params.teamId);
        if (
          !Number.isInteger(seasonId) ||
          seasonId <= 0 ||
          !Number.isInteger(teamId) ||
          teamId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId or teamId"
          } as any);
          return;
        }

        const user = request.user!;
        const result = lineupsService.setActiveLineup(
          seasonId,
          teamId,
          user,
          request.body
        );
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Inventory & Matches (Team Hub tabs)
  // ───────────────────────────

  // GET /seasons/:seasonId/teams/:teamId/inventory
  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: TeamInventoryResponse;
  }>(
    "/seasons/:seasonId/teams/:teamId/inventory",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        const teamId = Number(request.params.teamId);
        if (
          !Number.isInteger(seasonId) ||
          seasonId <= 0 ||
          !Number.isInteger(teamId) ||
          teamId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId or teamId"
          } as any);
          return;
        }

        const user = request.user!;
        const inventory = teamsService.getTeamInventory(seasonId, teamId, user);
        reply.send(inventory);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/teams/:teamId/matches
  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: TeamMatchesResponse;
  }>(
    "/seasons/:seasonId/teams/:teamId/matches",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        const teamId = Number(request.params.teamId);
        if (
          !Number.isInteger(seasonId) ||
          seasonId <= 0 ||
          !Number.isInteger(teamId) ||
          teamId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId or teamId"
          } as any);
          return;
        }

        const user = request.user!;
        const matches = teamsService.getTeamMatches(seasonId, teamId, user);
        reply.send(matches);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Join season → create team
  // ───────────────────────────

  // POST /seasons/:seasonId/teams/join
  app.post<{
    Params: { seasonId: string };
    Body: JoinSeasonTeamBody;
    Reply: TeamHubOverviewResponse;
  }>(
    "/seasons/:seasonId/teams/join",
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
        const team = teamsService.joinSeasonAndCreateTeam(
          seasonId,
          user,
          request.body
        );
        reply.code(201).send(team);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Transfer team (commissioner/owner)
  // ───────────────────────────

  // POST /seasons/:seasonId/teams/:teamId/transfer
  app.post<{
    Params: { seasonId: string; teamId: string };
    Body: TransferTeamBody;
    Reply: TeamHubOverviewResponse;
  }>(
    "/seasons/:seasonId/teams/:teamId/transfer",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        const teamId = Number(request.params.teamId);
        if (
          !Number.isInteger(seasonId) ||
          seasonId <= 0 ||
          !Number.isInteger(teamId) ||
          teamId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid seasonId or teamId"
          } as any);
          return;
        }

        const user = request.user!;
        const team = teamsService.transferTeam(
          seasonId,
          teamId,
          user,
          request.body
        );
        reply.send(team);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
