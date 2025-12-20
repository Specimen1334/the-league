// apps/api/src/modules/admin/admin.schemas.ts

/**
 * Common pagination query for admin list endpoints.
 * Used for things like /admin/users, /admin/leagues, etc.
 */
export type AdminListQuery = {
  page?: number;
  limit?: number;
  search?: string;
};

/**
 * Utility to normalise pagination query strings into numbers
 * with sane defaults. Can be used by routes/admin.ts directly.
 */
export function normalizeAdminListQuery(
  raw: Partial<Record<string, any>>
): Required<Pick<AdminListQuery, "page" | "limit">> {
  const page = Math.max(1, Number(raw.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(raw.limit) || 20));
  return { page, limit };
}

/**
 * Admin: update user fields.
 * Maps to /admin/users/:userId PATCH in the design doc.
 * - username, displayName, email: basic profile control
 * - role: elevation/demotion (user/commissioner/superadmin)
 * - isBanned: account status toggle
 */
export type AdminUpdateUserBody = {
  username?: string;
  displayName?: string | null;
  email?: string | null;
  role?: "user" | "commissioner" | "superadmin";
  isBanned?: boolean;
};

/**
 * Admin: update league fields.
 * Maps to /admin/leagues/:leagueId PATCH.
 */
export type AdminUpdateLeagueBody = {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  visibility?: "public" | "private" | "hidden";
  ownerUserId?: number;
};

/**
 * Admin: update season fields.
 * Maps to /admin/seasons/:seasonId PATCH.
 * This is intentionally generic; detailed rules are handled
 * inside the seasons module’s own schemas.
 */
export type AdminUpdateSeasonBody = {
  name?: string;
  description?: string | null;
  status?:
    | "Signup"
    | "Drafting"
    | "Active"
    | "Playoffs"
    | "Completed"
    | "Archived";
  formatType?:
    | "RoundRobin"
    | "Swiss"
    | "SingleElim"
    | "DoubleElim"
    | "GroupsPlayoffs"
    | "Hybrid";
  startsAt?: string | null; // ISO 8601
  endsAt?: string | null;   // ISO 8601
};

/**
 * Admin: update team fields.
 * Maps to /admin/teams/:teamId PATCH.
 */
export type AdminUpdateTeamBody = {
  name?: string;
  logoUrl?: string | null;
  managerUserId?: number;
  bio?: string | null;
};

/**
 * Admin: update match fields.
 * Maps to /admin/matches/:matchId PATCH.
 */
export type AdminUpdateMatchBody = {
  scheduledAt?: string | null; // ISO 8601
  status?:
    | "Scheduled"
    | "InProgress"
    | "AwaitingResult"
    | "Completed"
    | "Voided"
    | "UnderReview";
  teamAId?: number;
  teamBId?: number;
  round?: number | null;
  winnerTeamId?: number | null;
  scoreTeamA?: number | null;
  scoreTeamB?: number | null;
};

/**
 * Admin Danger Zone actions require explicit confirmation.
 * This maps to endpoints like:
 * - POST /admin/danger/delete-league
 * - POST /admin/danger/wipe-season
 *
 * The `confirm` field must match the text the route expects
 * (e.g. league name or the word "DELETE").
 */
export type AdminDangerActionBody = {
  confirm: string;
};

/**
 * Admin: simple feature-flag toggle payload.
 * Maps to /admin/config/features PATCH.
 */
export type AdminUpdateFeatureFlagBody = {
  key: string;
  enabled: boolean;
  scope?: "global" | "league" | "season";
  leagueId?: number;
  seasonId?: number;
};
