// apps/api/src/routes/matches.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { matchesService } from "../modules/matches/matches.service";
import { toErrorResponse } from "../shared/errors";

import type {
  MatchOverviewResponse,
  MatchLineupsResponse,
  FinalSheetsResponse,
  ProposeResultBody,
  VoteOnResultBody,
  AdminOverrideResultBody,
  AdminUpdateMatchBody
} from "../modules/matches/matches.schemas";

export function registerMatchRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // ───────────────────────────
  // Match overview (Match Hub)
  // ───────────────────────────

  // GET /matches/:matchId
  app.get<{
    Params: { matchId: string };
    Reply: MatchOverviewResponse;
  }>(
    "/matches/:matchId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        const match = matchesService.getMatchOverview(matchId, user);
        reply.send(match);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Lineups & visibility
  // ───────────────────────────

  // GET /matches/:matchId/lineups
  app.get<{
    Params: { matchId: string };
    Reply: MatchLineupsResponse;
  }>(
    "/matches/:matchId/lineups",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        const lineups = matchesService.getMatchLineups(matchId, user);
        reply.send(lineups);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // (Optional future) GET /matches/:matchId/lineups/raw – admin-only,
  // could be wired later once matchesService exposes it.

  // ───────────────────────────
  // Final sheets & stats (post-completion)
  // ───────────────────────────

  // GET /matches/:matchId/final-sheets
  app.get<{
    Params: { matchId: string };
    Reply: FinalSheetsResponse;
  }>(
    "/matches/:matchId/final-sheets",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        const sheets = matchesService.getFinalSheets(matchId, user);
        reply.send(sheets);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Result submission & voting
  // ───────────────────────────

  // POST /matches/:matchId/results
  app.post<{
    Params: { matchId: string };
    Body: ProposeResultBody;
    Reply: MatchOverviewResponse;
  }>(
    "/matches/:matchId/results",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        const match = matchesService.proposeResult(
          matchId,
          user,
          request.body
        );
        reply.send(match);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /matches/:matchId/results/:resultId/vote
  app.post<{
    Params: { matchId: string; resultId: string };
    Body: VoteOnResultBody;
    Reply: MatchOverviewResponse;
  }>(
    "/matches/:matchId/results/:resultId/vote",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        const resultId = Number(request.params.resultId);
        if (
          !Number.isInteger(matchId) ||
          matchId <= 0 ||
          !Number.isInteger(resultId) ||
          resultId <= 0
        ) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId or resultId"
          } as any);
          return;
        }

        const user = request.user!;
        const match = matchesService.voteOnResult(
          matchId,
          resultId,
          user,
          request.body
        );
        reply.send(match);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Admin tools (commissioner)
  // ───────────────────────────

  // POST /matches/:matchId/admin/override-result
  app.post<{
    Params: { matchId: string };
    Body: AdminOverrideResultBody;
    Reply: MatchOverviewResponse;
  }>(
    "/matches/:matchId/admin/override-result",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        const match = matchesService.adminOverrideResult(
          matchId,
          user,
          request.body
        );
        reply.send(match);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /matches/:matchId/admin/reset
  app.post<{
    Params: { matchId: string };
  }>(
    "/matches/:matchId/admin/reset",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        matchesService.adminResetMatch(matchId, user);
        reply.code(204).send();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // PATCH /matches/:matchId/admin – schedule/status edit
  app.patch<{
    Params: { matchId: string };
    Body: AdminUpdateMatchBody;
    Reply: MatchOverviewResponse;
  }>(
    "/matches/:matchId/admin",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const matchId = Number(request.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
          reply.code(400).send({
            error: "BadRequest",
            message: "Invalid matchId"
          } as any);
          return;
        }

        const user = request.user!;
        const match = matchesService.adminUpdateMatch(
          matchId,
          user,
          request.body
        );
        reply.send(match);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
