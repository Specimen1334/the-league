// apps/api/src/routes/draft.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { toErrorResponse } from "../shared/errors";
import { draftService } from "../modules/draft/draft.service";

import type {
  DraftLobbyResponse,
  DraftReadyResponse,
  DraftStateResponse,
  DraftPoolQuery,
  DraftPoolResponse,
  MyDraftResponse,
  DraftWatchlistBody,
  DraftWatchlistResponse,
  DraftPickBody,
  DraftResultsResponse,
  DraftTeamResultsResponse,
  DraftExportFormat,
  AdminForcePickBody
} from "../modules/draft/draft.schemas";

export function registerDraftRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // ───────────────────────────
  // Draft meta / lobby
  // ───────────────────────────

  // GET /seasons/:seasonId/draft/lobby
  app.get<{
    Params: { seasonId: string };
    Reply: DraftLobbyResponse;
  }>(
    "/seasons/:seasonId/draft/lobby",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const lobby = draftService.getLobby(request.params.seasonId, user);
        reply.send(lobby);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/ready
  app.post<{
    Params: { seasonId: string };
    Reply: DraftReadyResponse;
  }>(
    "/seasons/:seasonId/draft/ready",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = draftService.toggleReady(request.params.seasonId, user);
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Live draft state and views
  // ───────────────────────────

  // GET /seasons/:seasonId/draft/state
  app.get<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/state",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.getState(request.params.seasonId, user);
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/draft/pool
  app.get<{
    Params: { seasonId: string };
    Querystring: DraftPoolQuery;
    Reply: DraftPoolResponse;
  }>(
    "/seasons/:seasonId/draft/pool",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const pool = draftService.getPool(
          request.params.seasonId,
          user,
          request.query ?? {}
        );
        reply.send(pool);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/draft/my
  app.get<{
    Params: { seasonId: string };
    Reply: MyDraftResponse;
  }>(
    "/seasons/:seasonId/draft/my",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const my = draftService.getMyDraft(request.params.seasonId, user);
        reply.send(my);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Actions: watchlist & picks
  // ───────────────────────────

  // POST /seasons/:seasonId/draft/watchlist
  app.post<{
    Params: { seasonId: string };
    Body: DraftWatchlistBody;
    Reply: DraftWatchlistResponse;
  }>(
    "/seasons/:seasonId/draft/watchlist",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const list = draftService.updateWatchlist(
          request.params.seasonId,
          user,
          request.body
        );
        reply.send(list);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/pick
  app.post<{
    Params: { seasonId: string };
    Body: DraftPickBody;
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/pick",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.makePick(request.params.seasonId, user, request.body);
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Results & exports
  // ───────────────────────────

  // GET /seasons/:seasonId/draft/results
  app.get<{
    Params: { seasonId: string };
    Reply: DraftResultsResponse;
  }>(
    "/seasons/:seasonId/draft/results",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const results = draftService.getResults(request.params.seasonId, user);
        reply.send(results);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/draft/results/:teamId
  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: DraftTeamResultsResponse;
  }>(
    "/seasons/:seasonId/draft/results/:teamId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const results = draftService.getTeamResults(
          request.params.seasonId,
          request.params.teamId,
          user
        );
        reply.send(results);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/draft/results/export/showdown
  app.get<{
    Params: { seasonId: string };
  }>(
    "/seasons/:seasonId/draft/results/export/showdown",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const text = draftService.exportDraftResults(
          request.params.seasonId,
          user,
          "showdown" as DraftExportFormat
        );

        reply
          .header("Content-Type", "text/plain; charset=utf-8")
          .send(text);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /seasons/:seasonId/draft/results/export/csv
  app.get<{
    Params: { seasonId: string };
  }>(
    "/seasons/:seasonId/draft/results/export/csv",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const csv = draftService.exportDraftResults(
          request.params.seasonId,
          user,
          "csv" as DraftExportFormat
        );

        reply
          .header("Content-Type", "text/csv; charset=utf-8")
          .send(csv);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Commissioner controls
  // ───────────────────────────

  // POST /seasons/:seasonId/draft/admin/start
  app.post<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/start",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminStartDraft(request.params.seasonId, user);
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/admin/pause
  app.post<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/pause",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminPauseDraft(request.params.seasonId, user);
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/admin/end
  app.post<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/end",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminEndDraft(request.params.seasonId, user);
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/admin/force-pick
  app.post<{
    Params: { seasonId: string };
    Body: AdminForcePickBody;
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/force-pick",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminForcePick(
          request.params.seasonId,
          user,
          request.body
        );
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/admin/undo-last
  app.post<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/undo-last",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminUndoLast(request.params.seasonId, user);
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
