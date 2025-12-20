// apps/api/src/routes/draft.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { toErrorResponse } from "../shared/errors";
import { draftService } from "../modules/draft/draft.service";
import { draftRealtime } from "../modules/draft/draft.realtime";

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
  AdminForcePickBody,
  AdminUpdateDraftSettingsBody
} from "../modules/draft/draft.schemas";

export function registerDraftRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // ───────────────────────────
  // Realtime (SSE + presence)
  // ───────────────────────────

  // GET /seasons/:seasonId/draft/stream
  // Server-Sent Events stream for live draft updates.
  app.get<{ Params: { seasonId: string } }>(
    "/seasons/:seasonId/draft/stream",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({ error: "BadRequest", message: "seasonId must be a positive integer" });
          return;
        }

        // Standard SSE headers.
        reply.raw.statusCode = 200;
        reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
        reply.raw.setHeader("Connection", "keep-alive");
        // Prevent nginx buffering if present.
        reply.raw.setHeader("X-Accel-Buffering", "no");

        // Keep socket open.
        // @ts-expect-error Fastify types don't always include this.
        reply.raw.flushHeaders?.();

        draftRealtime.addSseClient(seasonId, reply.raw);

        // Let Fastify know we are handling the response manually.
        // @ts-expect-error Fastify reply has hijack in runtime.
        reply.hijack();
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/presence
  // Heartbeat endpoint. Returns current online userIds.
  app.post<{ Params: { seasonId: string }; Reply: { onlineUserIds: number[] } }>(
    "/seasons/:seasonId/draft/presence",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const seasonId = Number(request.params.seasonId);
        if (!Number.isInteger(seasonId) || seasonId <= 0) {
          reply.code(400).send({ onlineUserIds: [] });
          return;
        }

        const onlineUserIds = draftRealtime.heartbeat(seasonId, user.id);
        // Presence changes are interesting to clients.
        draftRealtime.emit(seasonId, "draft:presence", { onlineUserIds });

        reply.send({ onlineUserIds });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

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
        draftRealtime.emit(Number(request.params.seasonId), "draft:lobby", { kind: "ready" });
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:watchlist", { kind: "watchlist" });
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "pick" });
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

  

  // POST /seasons/:seasonId/draft/admin/reroll-order
  app.post<{
    Params: { seasonId: string };
    Reply: DraftLobbyResponse;
  }>(
    "/seasons/:seasonId/draft/admin/reroll-order",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const lobby = draftService.adminRerollOrder(request.params.seasonId, user);
        draftRealtime.emit(Number(request.params.seasonId), "draft:lobby", { kind: "reroll" });
        reply.send(lobby);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // PATCH /seasons/:seasonId/draft/admin/settings
  app.patch<{
    Params: { seasonId: string };
    Body: AdminUpdateDraftSettingsBody;
    Reply: DraftLobbyResponse;
  }>(
    "/seasons/:seasonId/draft/admin/settings",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const lobby = draftService.adminUpdateDraftSettings(
          request.params.seasonId,
          user,
          request.body ?? {}
        );
        draftRealtime.emit(Number(request.params.seasonId), "draft:lobby", { kind: "settings" });
        reply.send(lobby);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "start" });
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "pause" });
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/admin/resume
  app.post<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/resume",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminResumeDraft(request.params.seasonId, user);
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "resume" });
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "end" });
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "forcePick" });
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
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "undo" });
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /seasons/:seasonId/draft/admin/advance
  // Commissioner utility: auto-pick the next valid Pokémon for the team on the clock.
  app.post<{
    Params: { seasonId: string };
    Reply: DraftStateResponse;
  }>(
    "/seasons/:seasonId/draft/admin/advance",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const state = draftService.adminAdvanceDraft(request.params.seasonId, user);
        draftRealtime.emit(Number(request.params.seasonId), "draft:state", { kind: "advance" });
        reply.send(state);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
