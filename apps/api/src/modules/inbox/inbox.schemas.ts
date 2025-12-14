// apps/api/src/modules/inbox/inbox.schemas.ts

/**
 * High-level category for inbox messages.
 * You can tweak/extend this enum as you flesh out message types.
 */
export type InboxCategory =
  | "System"
  | "League"
  | "Season"
  | "Match"
  | "Trade"
  | "Admin"
  | "Other";

/**
 * Message type key – used to drive specific UI/actions per message.
 * We keep this intentionally loose; new types can be added freely.
 */
export type InboxMessageType =
  | "Announcement"
  | "InviteLeague"
  | "InviteSeason"
  | "InviteTeam"
  | "MatchScheduled"
  | "MatchResultNeeded"
  | "TradeProposed"
  | "TradeUpdated"
  | "Generic";

/**
 * Query for GET /inbox.
 */
export type InboxListQuery = {
  category?: InboxCategory | "All";
  /**
   * "read" | "unread" | "all"
   */
  read?: "read" | "unread" | "all";
  page?: number;
  limit?: number;
};

/**
 * Lightweight summary row for inbox list.
 */
export type InboxMessageSummary = {
  id: number;
  category: InboxCategory;
  type: InboxMessageType;
  subject: string;
  preview: string;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
  isRead: boolean;
  isArchived: boolean;

  from: {
    userId: number | null;
    isSystem: boolean;
    displayName: string | null;
  };

  related?: {
    leagueId?: number | null;
    seasonId?: number | null;
    matchId?: number | null;
  };
};

/**
 * Full message detail.
 */
export type InboxMessageDetailResponse = InboxMessageSummary & {
  body: string;
  /**
   * Arbitrary payload used by specific message types (JSON blob).
   * e.g. { leagueId, seasonId, inviteToken, ... }
   */
  payload: any;
};

/**
 * Response for GET /inbox.
 */
export type InboxListResponse = {
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
  items: InboxMessageSummary[];
};

/**
 * Body for POST /inbox/delete
 */
export type InboxDeleteBody = {
  messageIds: number[];
};

export type InboxDeleteResponse = {
  deleted: number;
};

/**
 * Body for POST /inbox/:messageId/reply
 * (for conversation-style system messages).
 */
export type InboxReplyBody = {
  body: string;
};
