// apps/api/src/routes/inbox.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { inboxService } from "../modules/inbox/inbox.service";
import { toErrorResponse } from "../shared/errors";
import type {
  InboxListQuery,
  InboxListResponse,
  InboxMessageDetailResponse,
  InboxDeleteBody,
  InboxDeleteResponse
} from "../modules/inbox/inbox.schemas";

export function registerInboxRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // GET /inbox – list messages for current user
  app.get<{ Querystring: InboxListQuery; Reply: InboxListResponse }>(
    "/inbox",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = inboxService.listMessages(user, request.query ?? {});
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /inbox/:messageId – message detail
  app.get<{ Params: { messageId: string }; Reply: InboxMessageDetailResponse }>(
    "/inbox/:messageId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = inboxService.getMessage(request.params.messageId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /inbox/:messageId/read – mark as read
  app.post<{ Params: { messageId: string }; Reply: InboxMessageDetailResponse }>(
    "/inbox/:messageId/read",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = inboxService.markMessageRead(request.params.messageId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /inbox/:messageId/archive – archive a message
  app.post<{ Params: { messageId: string }; Reply: InboxMessageDetailResponse }>(
    "/inbox/:messageId/archive",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = inboxService.archiveMessage(request.params.messageId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /inbox/mark-all-read
  app.post("/inbox/mark-all-read", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const user = request.user!;
      const result = inboxService.markAllRead(user);
      reply.send(result);
    } catch (err) {
      const { statusCode, payload } = toErrorResponse(err);
      reply.code(statusCode).send(payload);
    }
  });

  // POST /inbox/delete
  app.post<{ Body: InboxDeleteBody; Reply: InboxDeleteResponse }>(
    "/inbox/delete",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = inboxService.deleteMessages(user, request.body);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /inbox/unread-count
  app.get(
    "/inbox/unread-count",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const unreadCount = inboxService.getUnreadCount(user);
        reply.send({ unreadCount });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
