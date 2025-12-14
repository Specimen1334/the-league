// apps/api/src/modules/inbox/inbox.repo.ts
import { dbFile } from "../../db/index";
import type {
  InboxCategory,
  InboxMessageType,
  InboxListQuery
} from "./inbox.schemas";

/**
 * Expected schema (for reference, not enforced here):
 *
 * CREATE TABLE inbox_messages (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   to_user_id INTEGER NOT NULL,
 *   from_user_id INTEGER,
 *   from_system INTEGER NOT NULL DEFAULT 0,
 *   category TEXT NOT NULL,
 *   type TEXT NOT NULL,
 *   subject TEXT NOT NULL,
 *   body TEXT NOT NULL,
 *   payload_json TEXT,
 *   is_read INTEGER NOT NULL DEFAULT 0,
 *   is_archived INTEGER NOT NULL DEFAULT 0,
 *   created_at TEXT NOT NULL DEFAULT (datetime('now')),
 *   read_at TEXT,
 *   archived_at TEXT,
 *   related_league_id INTEGER,
 *   related_season_id INTEGER,
 *   related_match_id INTEGER
 * );
 */

export type InboxMessageRow = {
  id: number;
  toUserId: number;
  fromUserId: number | null;
  fromSystem: boolean;
  category: InboxCategory;
  type: InboxMessageType;
  subject: string;
  body: string;
  payloadJson: string | null;
  isRead: boolean;
  isArchived: boolean;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  relatedLeagueId: number | null;
  relatedSeasonId: number | null;
  relatedMatchId: number | null;
};

const getMessageByIdForUserStmt = dbFile.prepare<[number, number]>(`
  SELECT
    id,
    to_user_id        AS toUserId,
    from_user_id      AS fromUserId,
    from_system       AS fromSystem,
    category,
    type,
    subject,
    body,
    payload_json      AS payloadJson,
    is_read           AS isRead,
    is_archived       AS isArchived,
    created_at        AS createdAt,
    read_at           AS readAt,
    archived_at       AS archivedAt,
    related_league_id AS relatedLeagueId,
    related_season_id AS relatedSeasonId,
    related_match_id  AS relatedMatchId
  FROM inbox_messages
  WHERE id = ? AND to_user_id = ?
`);

const markReadStmt = dbFile.prepare<[number, number]>(`
  UPDATE inbox_messages
  SET
    is_read = 1,
    read_at = COALESCE(read_at, datetime('now'))
  WHERE id = ? AND to_user_id = ?
  RETURNING
    id,
    to_user_id        AS toUserId,
    from_user_id      AS fromUserId,
    from_system       AS fromSystem,
    category,
    type,
    subject,
    body,
    payload_json      AS payloadJson,
    is_read           AS isRead,
    is_archived       AS isArchived,
    created_at        AS createdAt,
    read_at           AS readAt,
    archived_at       AS archivedAt,
    related_league_id AS relatedLeagueId,
    related_season_id AS relatedSeasonId,
    related_match_id  AS relatedMatchId
`);

const markArchivedStmt = dbFile.prepare<[number, number]>(`
  UPDATE inbox_messages
  SET
    is_archived = 1,
    archived_at = COALESCE(archived_at, datetime('now'))
  WHERE id = ? AND to_user_id = ?
  RETURNING
    id,
    to_user_id        AS toUserId,
    from_user_id      AS fromUserId,
    from_system       AS fromSystem,
    category,
    type,
    subject,
    body,
    payload_json      AS payloadJson,
    is_read           AS isRead,
    is_archived       AS isArchived,
    created_at        AS createdAt,
    read_at           AS readAt,
    archived_at       AS archivedAt,
    related_league_id AS relatedLeagueId,
    related_season_id AS relatedSeasonId,
    related_match_id  AS relatedMatchId
`);

const markAllReadStmt = dbFile.prepare<[number]>(`
  UPDATE inbox_messages
  SET
    is_read = 1,
    read_at = COALESCE(read_at, datetime('now'))
  WHERE to_user_id = ? AND is_read = 0
`);

const countUnreadStmt = dbFile.prepare<[number]>(`
  SELECT COUNT(*) AS unreadCount
  FROM inbox_messages
  WHERE to_user_id = ? AND is_read = 0
`);

const createReplyStmt = dbFile.prepare<
  [
    number,
    number | null,
    number,
    string,
    string,
    string | null,
    string | null,
    number | null,
    number | null
  ]
>(`
  INSERT INTO inbox_messages (
    to_user_id,
    from_user_id,
    from_system,
    category,
    type,
    subject,
    body,
    payload_json,
    related_league_id,
    related_season_id,
    related_match_id
  )
  SELECT
    from_user_id AS to_user_id,
    ?            AS from_user_id,
    0            AS from_system,
    category,
    'Generic'    AS type,
    subject,
    ?            AS body,
    ?            AS payload_json,
    related_league_id,
    related_season_id,
    related_match_id
  FROM inbox_messages
  WHERE id = ?
  RETURNING
    id,
    to_user_id        AS toUserId,
    from_user_id      AS fromUserId,
    from_system       AS fromSystem,
    category,
    type,
    subject,
    body,
    payload_json      AS payloadJson,
    is_read           AS isRead,
    is_archived       AS isArchived,
    created_at        AS createdAt,
    read_at           AS readAt,
    archived_at       AS archivedAt,
    related_league_id AS relatedLeagueId,
    related_season_id AS relatedSeasonId,
    related_match_id  AS relatedMatchId
`);

/**
 * Normalised list query used by repo.
 */
export type NormalisedInboxListQuery = {
  category: InboxCategory | "All";
  read: "read" | "unread" | "all";
  page: number;
  limit: number;
};

export const inboxRepo = {
  getMessageByIdForUser(
    messageId: number,
    userId: number
  ): InboxMessageRow | undefined {
    return getMessageByIdForUserStmt.get(
      messageId,
      userId
    ) as InboxMessageRow | undefined;
  },

  listMessagesForUser(
    userId: number,
    query: NormalisedInboxListQuery
  ): { rows: InboxMessageRow[]; total: number } {
    const filters: string[] = ["to_user_id = @userId"];
    const params: Record<string, any> = {
      userId,
      page: query.page,
      limit: query.limit
    };

    if (query.category !== "All") {
      filters.push("category = @category");
      params.category = query.category;
    }

    if (query.read === "read") {
      filters.push("is_read = 1");
    } else if (query.read === "unread") {
      filters.push("is_read = 0");
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    const offset = (query.page - 1) * query.limit;
    params.offset = offset; // 👈 ADD THIS

    const listSql = `
      SELECT
        id,
        to_user_id        AS toUserId,
        from_user_id      AS fromUserId,
        from_system       AS fromSystem,
        category,
        type,
        subject,
        body,
        payload_json      AS payloadJson,
        is_read           AS isRead,
        is_archived       AS IsArchived,
        created_at        AS createdAt,
        read_at           AS readAt,
        archived_at       AS archivedAt,
        related_league_id AS relatedLeagueId,
        related_season_id AS relatedSeasonId,
        related_match_id  AS relatedMatchId
      FROM inbox_messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM inbox_messages
      ${whereClause}
    `;

    const listStmt = dbFile.prepare(listSql);
    const countStmt = dbFile.prepare(countSql);

    const rows = listStmt.all(params) as InboxMessageRow[];
    const countRow = countStmt.get(params) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    return { rows, total };
  },

  markRead(
    messageId: number,
    userId: number
  ): InboxMessageRow | undefined {
    return markReadStmt.get(messageId, userId) as InboxMessageRow | undefined;
  },

  markArchived(
    messageId: number,
    userId: number
  ): InboxMessageRow | undefined {
    return markArchivedStmt.get(
      messageId,
      userId
    ) as InboxMessageRow | undefined;
  },

  markAllRead(userId: number): number {
    const info = markAllReadStmt.run(userId);
    return info.changes ?? 0;
  },

  getUnreadCount(userId: number): number {
    const row = countUnreadStmt.get(userId) as { unreadCount: number } | undefined;
    return row?.unreadCount ?? 0;
  },

  deleteMessages(userId: number, messageIds: number[]): number {
    if (messageIds.length === 0) return 0;

    const placeholders = messageIds.map(() => "?").join(",");
    const sql = `
      DELETE FROM inbox_messages
      WHERE to_user_id = ?
        AND id IN (${placeholders})
    `;
    const stmt = dbFile.prepare(sql);
    const info = stmt.run(userId, ...messageIds);
    return info.changes ?? 0;
  },

  /**
   * Create a reply message based on the original message's routing.
   * Returns the newly created row, or undefined if the original
   * message doesn't exist or had no from_user_id.
   */
  createReplyFromOriginal(
    originalMessageId: number,
    fromUserId: number,
    body: string
  ): InboxMessageRow | undefined {
    const payloadJson = null;
    const row = createReplyStmt.get(
      fromUserId,
      body,
      payloadJson,
      originalMessageId
    ) as InboxMessageRow | undefined;
    return row;
  }
};

/** Handy normaliser so service layer can share the logic. */
export function normaliseInboxListQuery(
  raw: InboxListQuery
): NormalisedInboxListQuery {
  const page = Math.max(1, Number(raw.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(raw.limit) || 20));
  const category = (raw.category ?? "All") as InboxCategory | "All";
  const read = (raw.read ?? "all") as "read" | "unread" | "all";

  return { page, limit, category, read };
}
