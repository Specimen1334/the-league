// apps/api/src/modules/seasons/seasons.schemas.ts

import type { TeamRecord } from "../teams/teams.schemas";

/**
 * Season status lifecycle.
 * Matches the design doc states:
 *   Signup → Drafting → Active → Playoffs → Completed → Archived
 */
export type SeasonStatus =
  | "Signup"
  | "Drafting"
  | "Active"
  | "Playoffs"
  | "Completed"
  | "Archived";

/**
 * Overall format of the competition.
 */
export type SeasonFormatType =
  | "RoundRobin"
  | "Swiss"
  | "SingleElim"
  | "DoubleElim"
  | "GroupsPlayoffs"
  | "Hybrid";

/**
 * Body for POST /leagues/:leagueId/seasons
 * (league owner/commissioner)
 */
export type CreateSeasonBody = {
  name: string;
  description?: string | null;

  /**
   * Defaults to "Signup" unless explicitly provided.
   */
  status?: SeasonStatus;

  /**
   * Defaults to "RoundRobin" unless explicitly provided.
   */
  formatType?: SeasonFormatType;

  /**
   * ISO 8601 timestamps (optional).
   */
  startsAt?: string | null;
  endsAt?: string | null;
};

/**
 * Body for PATCH /seasons/:seasonId (commissioner-level).
 */
export type SeasonUpdateBody = {
  name?: string;
  description?: string | null;
  status?: SeasonStatus;
  formatType?: SeasonFormatType;
  startsAt?: string | null; // ISO 8601
  endsAt?: string | null; // ISO 8601
};

/**
 * Draft/trade config that is season-scoped (NOT global).
 * Used by Draft Lobby config, trades rules, etc.
 */
export type SeasonSettings = {
  pickTimerSeconds: number; // integer seconds
  roundCount: number; // integer rounds
  draftType: "Snake" | "Linear";
  /** Maximum total draft points a team may spend. 0 means unlimited. */
  draftPointCap: number;
  allowTrades: boolean;
  tradeDeadlineAt: string | null; // ISO 8601 or null (no deadline)
};

export type SeasonSettingsResponse = {
  seasonId: number;
  settings: SeasonSettings;
};

export type UpdateSeasonSettingsBody = Partial<SeasonSettings>;

/**
 * Overview returned by GET /seasons/:seasonId.
 * This powers the Season Hub hero and high-level cards.
 */
export type SeasonOverviewResponse = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    description: string | null;
    status: SeasonStatus;
    formatType: SeasonFormatType;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
  };

  /**
   * The user's own team in this season, if any.
   */
  yourTeam?: {
    teamId: number;
    name: string;
    logoUrl: string | null;
  };

  /**
   * Simple progress stats used for progress bars, etc.
   */
  stats: {
    teamCount: number;
    matchCount: number;
    completedMatchCount: number;
  };

  /**
   * Small slices for cards on the Season Hub.
   */
  upcomingMatches: {
    matchId: number;
    round: number | null;
    scheduledAt: string | null;
    teamAId: number;
    teamBId: number;
  }[];

  recentResults: {
    matchId: number;
    round: number | null;
    completedAt: string | null;
    winnerTeamId: number | null;
    teamAId: number;
    teamBId: number;
    scoreTeamA: number | null;
    scoreTeamB: number | null;
  }[];
};

/**
 * Season team summary used by GET /seasons/:seasonId/teams.
 */
export type SeasonTeamSummary = {
  teamId: number;
  name: string;
  logoUrl: string | null;
  managerUserId: number;
  managerDisplayName: string | null;
  record: TeamRecord;
};

export type SeasonTeamsResponse = {
  seasonId: number;
  teams: SeasonTeamSummary[];
};

/**
 * Query params for the standings endpoint.
 */
export type SeasonStandingsQuery = {
  sortBy?: "points" | "wins" | "name";
};

/**
 * A single row in the season standings table.
 */
export type SeasonStandingsRow = {
  rank: number;
  teamId: number;
  name: string;
  logoUrl: string | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
};

/**
 * Response for GET /seasons/:seasonId/standings.
 */
export type SeasonStandingsResponse = {
  seasonId: number;
  sortBy: "points" | "wins" | "name";
  rows: SeasonStandingsRow[];
};

/**
 * Payload for generating schedules.
 * RoundRobin first.
 */
export type GenerateScheduleBody = {
  rounds?: number | null; // reserved for future; RR currently derives rounds automatically
  startAt?: string | null; // ISO 8601
  cadenceDays?: number | null; // default 7
};

/**
 * Minimal match view for calendar pages.
 * NOTE: status is string until we align it to matches.schemas.ts
 */
export type SeasonCalendarMatch = {
  matchId: number;
  round: number | null;
  scheduledAt: string | null;
  teamAId: number;
  teamBId: number;
  status: string;
};

export type SeasonCalendarResponse = {
  seasonId: number;
  matches: SeasonCalendarMatch[];
};

/**
 * Response for POST /seasons/:seasonId/standings/recalculate
 */
export type SeasonStandingsRecalculateResponse = {
  seasonId: number;
  rows: SeasonStandingsRow[];
};
