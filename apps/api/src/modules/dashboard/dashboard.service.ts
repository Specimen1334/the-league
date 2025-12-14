// apps/api/src/modules/dashboard/dashboard.service.ts

import { dbFile } from "../../db/index";
import type { AppUser, UserRole } from "../../shared/types";
import {
  inboxRepo,
  normaliseInboxListQuery,
  type InboxMessageRow
} from "../inbox/inbox.repo";
import type {
  DashboardLeague,
  DashboardDraft,
  DashboardMatch,
  DashboardNotification,
  DashboardResponse
} from "./dashboard.schemas";

/**
 * Normalise league membership + global user role into the
 * simple role label expected by the dashboard UI.
 */
function mapMembershipRoleToDashboardRole(
  userRole: UserRole,
  membershipRole: string
): DashboardLeague["role"] {
  // Global superadmin always wins
  if (userRole === "superadmin") return "superadmin";

  const norm = membershipRole.toLowerCase();
  if (norm === "owner" || norm === "commissioner") {
    return "commissioner";
  }

  // For now, normal members are "players".
  return "player";
}

/**
 * Simple preview builder copied from inbox.service.ts
 * (kept local to avoid circular deps).
 */
function buildPreview(body: string, maxLen = 120): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1) + "…";
}

/**
 * Leagues the user is in + a best-guess "current" season and team.
 *
 * - Leagues come from league_members.
 * - "current" season is the most relevant non-archived season:
 *     Active > Drafting > Signup > Playoffs, newest first.
 * - Team is the team in that season belonging to the user (if any).
 */
function getLeaguesForUser(user: AppUser): DashboardLeague[] {
  type Row = {
    leagueId: number;
    leagueName: string;
    leagueLogoUrl: string | null;
    membershipRole: string;
    currentSeasonId: number | null;
    currentSeasonName: string | null;
    currentSeasonStatus: string | null;
    teamId: number | null;
    teamName: string | null;
  };

  const rows = dbFile
    .prepare<Row[], [number]>(`
      SELECT
        l.id        AS leagueId,
        l.name      AS leagueName,
        l.logo_url  AS leagueLogoUrl,
        lm.role     AS membershipRole,
        s.id        AS currentSeasonId,
        s.name      AS currentSeasonName,
        s.status    AS currentSeasonStatus,
        t.id        AS teamId,
        t.name      AS teamName
      FROM league_members lm
      JOIN leagues l ON l.id = lm.league_id
      LEFT JOIN seasons s
        ON s.id = (
          SELECT s2.id
          FROM seasons s2
          WHERE s2.league_id = l.id
            AND s2.status IN ('Signup','Drafting','Active','Playoffs')
          ORDER BY
            CASE s2.status
              WHEN 'Active'   THEN 1
              WHEN 'Drafting' THEN 2
              WHEN 'Signup'   THEN 3
              WHEN 'Playoffs' THEN 4
              ELSE 99
            END,
            s2.starts_at IS NULL,
            s2.starts_at DESC,
            s2.created_at DESC
          LIMIT 1
        )
      LEFT JOIN teams t
        ON t.season_id = s.id
       AND t.user_id   = lm.user_id
      WHERE lm.user_id = ?
      ORDER BY l.created_at DESC
    `)
    .all(user.id) as Row[];

  return rows.map((row) => ({
    leagueId: row.leagueId,
    leagueName: row.leagueName,
    leagueLogoUrl: row.leagueLogoUrl,
    currentSeasonId: row.currentSeasonId,
    currentSeasonName: row.currentSeasonName,
    currentSeasonStatus: row.currentSeasonStatus,
    teamId: row.teamId,
    teamName: row.teamName,
    role: mapMembershipRoleToDashboardRole(user.role, row.membershipRole)
  }));
}

/**
 * Upcoming drafts for the user's leagues.
 *
 * We treat a "draft" as upcoming when the season is in Signup/Drafting.
 * StartsAt prefers draft_sessions.starts_at, falling back to seasons.starts_at.
 */
function getUpcomingDraftsForUser(user: AppUser): DashboardDraft[] {
  type Row = {
    seasonId: number;
    leagueId: number;
    leagueName: string;
    seasonName: string;
    status: string;
    startsAt: string | null;
  };

  const rows = dbFile
    .prepare<Row[], [number]>(`
      SELECT
        s.id                    AS seasonId,
        l.id                    AS leagueId,
        l.name                  AS leagueName,
        s.name                  AS seasonName,
        s.status                AS status,
        COALESCE(ds.starts_at, s.starts_at) AS startsAt
      FROM league_members lm
      JOIN leagues l ON l.id = lm.league_id
      JOIN seasons s ON s.league_id = l.id
      LEFT JOIN draft_sessions ds ON ds.season_id = s.id
      WHERE lm.user_id = ?
        AND s.status IN ('Signup','Drafting')
      ORDER BY
        startsAt IS NULL,
        startsAt ASC,
        s.created_at DESC
      LIMIT 5
    `)
    .all(user.id) as Row[];

  return rows.map((row) => ({
    seasonId: row.seasonId,
    leagueId: row.leagueId,
    leagueName: row.leagueName,
    seasonName: row.seasonName,
    status: row.status,
    startsAt: row.startsAt
  }));
}

/**
 * Upcoming matches involving any of the user's teams.
 *
 * We include matches where:
 * - user owns team_a or team_b
 * - match status is Scheduled / AwaitingResult / InProgress
 */
function getUpcomingMatchesForUser(user: AppUser): DashboardMatch[] {
  type Row = {
    matchId: number;
    leagueId: number;
    seasonId: number;
    leagueName: string;
    seasonName: string;
    round: number | null;
    scheduledAt: string | null;
    status: string;
    yourTeamName: string | null;
    opponentTeamName: string | null;
  };

  const rows = dbFile
    .prepare<Row[], [number]>(`
      SELECT
        m.id          AS matchId,
        m.league_id   AS leagueId,
        m.season_id   AS seasonId,
        l.name        AS leagueName,
        s.name        AS seasonName,
        m.round       AS round,
        m.scheduled_at AS scheduledAt,
        m.status      AS status,
        myTeam.name   AS yourTeamName,
        CASE
          WHEN m.team_a_id = myTeam.id THEN tb.name
          WHEN m.team_b_id = myTeam.id THEN ta.name
          ELSE NULL
        END          AS opponentTeamName
      FROM matches m
      JOIN seasons s ON s.id = m.season_id
      JOIN leagues l ON l.id = m.league_id
      JOIN teams myTeam
        ON myTeam.season_id = m.season_id
       AND myTeam.user_id   = ?
       AND (myTeam.id = m.team_a_id OR myTeam.id = m.team_b_id)
      LEFT JOIN teams ta ON ta.id = m.team_a_id
      LEFT JOIN teams tb ON tb.id = m.team_b_id
      WHERE m.status IN ('Scheduled','AwaitingResult','InProgress')
      ORDER BY
        m.scheduled_at IS NULL,
        m.scheduled_at ASC,
        m.id ASC
      LIMIT 5
    `)
    .all(user.id) as Row[];

  return rows.map((row) => ({
    matchId: row.matchId,
    leagueId: row.leagueId,
    seasonId: row.seasonId,
    leagueName: row.leagueName,
    seasonName: row.seasonName,
    round: row.round,
    scheduledAt: row.scheduledAt,
    status: row.status,
    yourTeamName: row.yourTeamName ?? undefined,
    opponentTeamName: row.opponentTeamName ?? undefined
  }));
}

/**
 * Recent notifications, mapped from inbox messages.
 *
 * We just take the 5 most recent messages (any category/read state)
 * and map them into a lightweight notification shape.
 */
function getRecentNotificationsForUser(
  user: AppUser
): DashboardNotification[] {
  const query = normaliseInboxListQuery({
    category: "All",
    read: "all",
    page: 1,
    limit: 5
  });

  const { rows } = inboxRepo.listMessagesForUser(user.id, query);

  return (rows as InboxMessageRow[]).map((row) => {
    const type = row.category?.toString().toLowerCase() ?? "system";

    return {
      id: row.id,
      type,
      title: row.subject,
      message: buildPreview(row.body),
      createdAt: row.createdAt,
      isRead: row.isRead,
      // You can thread this later using row.relatedLeagueId/seasonId/matchId
      href: null
    };
  });
}

export const dashboardService = {
  /**
   * Aggregate dashboard payload for GET /dashboard.
   */
  getDashboard(user: AppUser): DashboardResponse {
    const leagues = getLeaguesForUser(user);
    const upcomingDrafts = getUpcomingDraftsForUser(user);
    const upcomingMatches = getUpcomingMatchesForUser(user);
    const notifications = getRecentNotificationsForUser(user);

    return {
      leagues,
      upcomingDrafts,
      upcomingMatches,
      notifications
    };
  }
};
