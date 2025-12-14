// apps/api/src/modules/inbox/inbox.service.ts
import type { AppUser } from "../../shared/types";
import {
  inboxRepo,
  normaliseInboxListQuery,
  type InboxMessageRow
} from "./inbox.repo";
import type {
  InboxListQuery,
  InboxListResponse,
  InboxMessageSummary,
  InboxMessageDetailResponse,
  InboxDeleteBody,
  InboxDeleteResponse,
  InboxReplyBody
} from "./inbox.schemas";

/**
 * Inbox service: thin domain layer over inbox_repo.
 * Used by routes/inbox.ts.
 */

export const inboxService = {
  /**
   * GET /inbox
   */
  listMessages(user: AppUser, rawQuery: InboxListQuery): InboxListResponse {
    const query = normaliseInboxListQuery(rawQuery);
    const { rows, total } = inboxRepo.listMessagesForUser(user.id, query);
    const unreadCount = inboxRepo.getUnreadCount(user.id);

    const items: InboxMessageSummary[] = rows.map(mapRowToSummary);

    return {
      page: query.page,
      limit: query.limit,
      total,
      unreadCount,
      items
    };
  },

  /**
   * GET /inbox/:messageId
   */
  getMessage(messageIdParam: string, user: AppUser): InboxMessageDetailResponse {
    const messageId = parseMessageId(messageIdParam);

    const row = inboxRepo.getMessageByIdForUser(messageId, user.id);
    if (!row) {
      const err = new Error("Message not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return mapRowToDetail(row);
  },

  /**
   * POST /inbox/:messageId/read
   */
  markMessageRead(
    messageIdParam: string,
    user: AppUser
  ): InboxMessageDetailResponse {
    const messageId = parseMessageId(messageIdParam);

    const row = inboxRepo.markRead(messageId, user.id);
    if (!row) {
      const err = new Error("Message not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return mapRowToDetail(row);
  },

  /**
   * POST /inbox/:messageId/archive
   */
  archiveMessage(messageIdParam: string, user: AppUser): InboxMessageDetailResponse {
    const messageId = parseMessageId(messageIdParam);

    const row = inboxRepo.markArchived(messageId, user.id);
    if (!row) {
      const err = new Error("Message not found");
      (err as any).statusCode = 404;
      throw err;
    }

    return mapRowToDetail(row);
  },

  /**
   * POST /inbox/mark-all-read
   */
  markAllRead(user: AppUser): { updated: number; unreadCount: number } {
    const updated = inboxRepo.markAllRead(user.id);
    const unreadCount = inboxRepo.getUnreadCount(user.id);

    return { updated, unreadCount };
  },

  /**
   * GET /inbox/unread-count
   */
  getUnreadCount(user: AppUser): number {
    return inboxRepo.getUnreadCount(user.id);
  },

  /**
   * POST /inbox/delete
   */
  deleteMessages(
    user: AppUser,
    body: InboxDeleteBody
  ): InboxDeleteResponse {
    const ids = Array.isArray(body.messageIds)
      ? body.messageIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (ids.length === 0) {
      return { deleted: 0 };
    }

    const deleted = inboxRepo.deleteMessages(user.id, ids);
    return { deleted };
  },

  /**
   * POST /inbox/:messageId/reply
   */
  replyToMessage(
    user: AppUser,
    messageIdParam: string,
    body: InboxReplyBody
  ): InboxMessageDetailResponse {
    const messageId = parseMessageId(messageIdParam);
    const text = (body.body ?? "").trim();
    if (text.length === 0) {
      const err = new Error("Reply body cannot be empty");
      (err as any).statusCode = 400;
      throw err;
    }

    // Ensure original exists and belongs to the user.
    const original = inboxRepo.getMessageByIdForUser(messageId, user.id);
    if (!original) {
      const err = new Error("Message not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // If the original has no fromUserId (pure system message), we could:
    // - send to null (no-op), or
    // - later support replies to a league/season "commissioner inbox".
    // For now, if fromUserId is null we reject.
    if (original.fromUserId == null) {
      const err = new Error("This message cannot be replied to");
      (err as any).statusCode = 400;
      throw err;
    }

    const replyRow = inboxRepo.createReplyFromOriginal(
      original.id,
      user.id,
      text
    );
    if (!replyRow) {
      const err = new Error("Failed to create reply");
      (err as any).statusCode = 500;
      throw err;
    }

    return mapRowToDetail(replyRow);
  }
};

function parseMessageId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Invalid messageId");
    (err as any).statusCode = 400;
    throw err;
  }
  return id;
}

function mapRowToSummary(row: InboxMessageRow): InboxMessageSummary {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    subject: row.subject,
    preview: buildPreview(row.body),
    createdAt: row.createdAt,
    readAt: row.readAt,
    archivedAt: row.archivedAt,
    isRead: row.isRead,
    isArchived: row.isArchived,
    from: {
      userId: row.fromUserId,
      isSystem: row.fromSystem,
      displayName: null // can be joined from users later
    },
    related: {
      leagueId: row.relatedLeagueId ?? undefined,
      seasonId: row.relatedSeasonId ?? undefined,
      matchId: row.relatedMatchId ?? undefined
    }
  };
}

function mapRowToDetail(row: InboxMessageRow): InboxMessageDetailResponse {
  const summary = mapRowToSummary(row);
  let payload: any = null;
  if (row.payloadJson) {
    try {
      payload = JSON.parse(row.payloadJson);
    } catch {
      payload = null;
    }
  }

  return {
    ...summary,
    body: row.body,
    payload
  };
}

function buildPreview(body: string, maxLen = 120): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1) + "…";
}
