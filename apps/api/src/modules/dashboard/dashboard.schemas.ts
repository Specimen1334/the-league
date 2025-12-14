// apps/api/src/modules/dashboard/dashboard.schemas.ts

/**
 * Mirrors the Dashboard types used by the web app:
 * apps/web/app/dashboard/page.tsx
 */

export type DashboardLeague = {
  leagueId: number;
  leagueName: string;
  leagueLogoUrl?: string | null;

  currentSeasonId?: number | null;
  currentSeasonName?: string | null;
  currentSeasonStatus?: string | null;

  teamId?: number | null;
  teamName?: string | null;

  /**
   * Normalised role for the dashboard UI.
   * Derived from league_members.role + global user role.
   *
   * "player"        -> normal member
   * "commissioner"  -> owner/commissioner
   * "superadmin"    -> global superadmin
   * "spectator"     -> reserved if you ever support non-members
   */
  role: "player" | "commissioner" | "superadmin" | "spectator" | string;
};

export type DashboardDraft = {
  seasonId: number;
  leagueId: number;
  leagueName: string;
  seasonName: string;
  /**
   * Season lifecycle status, e.g. "Signup" | "Drafting".
   */
  status: string;
  /**
   * Draft start (if configured), otherwise season start.
   */
  startsAt: string | null;
};

export type DashboardMatch = {
  matchId: number;
  leagueId: number;
  seasonId: number;
  leagueName: string;
  seasonName: string;
  round: number | null;
  scheduledAt: string | null;
  status: string;
  yourTeamName?: string | null;
  opponentTeamName?: string | null;
};

export type DashboardNotification = {
  id: number;
  /**
   * High-level type for UI chips: "match", "draft", "system", etc.
   * We derive this from Inbox category/type.
   */
  type: string;
  title: string;
  message: string;
  createdAt: string; // ISO
  isRead?: boolean;
  href?: string | null;
};

export type DashboardResponse = {
  leagues: DashboardLeague[];
  upcomingDrafts: DashboardDraft[];
  upcomingMatches: DashboardMatch[];
  notifications: DashboardNotification[];
};
