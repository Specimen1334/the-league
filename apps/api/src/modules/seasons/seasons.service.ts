// apps/api/src/modules/seasons/seasons.service.ts
import type { AppUser } from "../../shared/types";
import { seasonsRepo } from "./seasons.repo";
import { teamsRepo } from "../teams/teams.repo";
import type { LeagueMemberRole } from "../leagues/leagues.schemas";
import { assertLeagueRole } from "../../shared/permissions";
import { seasonStandingsService } from "./seasons.standings";
import {
  type SeasonUpdateBody,
  type SeasonOverviewResponse,
  type SeasonTeamsResponse,
  type SeasonTeamSummary,
  type SeasonSettingsResponse,
  type UpdateSeasonSettingsBody,
  type GenerateScheduleBody,
  type SeasonCalendarResponse,
  type SeasonCalendarMatch,
  type SeasonStandingsResponse,
  type SeasonStandingsQuery,
  type SeasonStandingsRecalculateResponse
} from "./seasons.schemas";

/**
 * Permissions (design-aligned):
 * - Mutating a season requires league role owner/commissioner (or superadmin).
 * - Viewing season info remains allowed for any authed user for now (as previously).
 */
function assertCanEditSeason(user: AppUser, leagueId: number): LeagueMemberRole {
  return assertLeagueRole(user, leagueId, ["owner", "commissioner"]);
}

function mustGetSeason(seasonId: number) {
  const season = seasonsRepo.getSeasonById(seasonId);
  if (!season) {
    const err = new Error("Season not found");
    (err as any).statusCode = 404;
    throw err;
  }
  return season;
}

function parseOptionalIsoDate(field: string, v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    const err = new Error(`Invalid ${field}`);
    (err as any).statusCode = 400;
    throw err;
  }
  return d.toISOString();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Round-robin pairings using the circle method.
 * Returns an array of rounds, each round is list of pairings [A,B].
 */
function buildRoundRobinRounds(teamIds: number[]): Array<Array<[number, number]>> {
  const ids = [...teamIds];
  if (ids.length < 2) return [];

  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push(-1);

  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;

  const out: Array<Array<[number, number]>> = [];

  for (let r = 0; r < rounds; r++) {
    const pairings: Array<[number, number]> = [];
    for (let i = 0; i < half; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a !== -1 && b !== -1) pairings.push([a, b]);
    }

    out.push(pairings);

    // rotate all but first
    const fixed = ids[0];
    const rest = ids.slice(1);
    rest.unshift(rest.pop()!);
    ids.splice(0, ids.length, fixed, ...rest);
  }

  return out;
}

export const seasonsService = {
  /**
   * GET /seasons/:seasonId
   */
  getSeasonOverview(seasonId: number, user: AppUser): SeasonOverviewResponse {
    const season = mustGetSeason(seasonId);

    const seasonTeams = teamsRepo.listSeasonTeams(season.id);
    const teamCount = seasonTeams.length;

    const yourTeamRow = teamsRepo.getTeamBySeasonAndUser(season.id, user.id);

    // Dedupe matches by matchId (listTeamMatches returns duplicates across teams).
    const seenMatchIds = new Set<number>();
    const matches: {
      id: number;
      round: number | null;
      scheduledAt: string | null;
      status: string;
      teamAId: number;
      teamBId: number;
      winnerTeamId: number | null;
      scoreTeamA: number | null;
      scoreTeamB: number | null;
    }[] = [];

    for (const t of seasonTeams) {
      const ms = teamsRepo.listTeamMatches(season.id, t.id);
      for (const m of ms) {
        if (seenMatchIds.has(m.id)) continue;
        seenMatchIds.add(m.id);

        matches.push({
          id: m.id,
          round: m.round ?? null,
          scheduledAt: m.scheduledAt ?? null,
          status: m.status,
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          winnerTeamId: m.winnerTeamId ?? null,
          scoreTeamA: m.scoreTeamA ?? null,
          scoreTeamB: m.scoreTeamB ?? null
        });
      }
    }

    const matchCount = matches.length;
    const completed = matches.filter((m) => m.status === "Completed");
    const completedMatchCount = completed.length;

    // Upcoming: prefer soonest scheduled first; unscheduled at the end.
    const upcomingMatches = matches
      .filter((m) => m.status !== "Completed")
      .map((m) => ({
        matchId: m.id,
        round: m.round ?? null,
        scheduledAt: m.scheduledAt ?? null,
        teamAId: m.teamAId,
        teamBId: m.teamBId
      }))
      .sort((a, b) => {
        const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        const ra = a.round ?? Number.MAX_SAFE_INTEGER;
        const rb = b.round ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      })
      .slice(0, 5);

    // Recent results: we do NOT have completedAt in the current repo selection,
    // so we sort by round desc then matchId desc as a stable approximation.
    const recentResults = completed
      .map((m) => ({
        matchId: m.id,
        round: m.round ?? null,
        completedAt: null as string | null,
        winnerTeamId: m.winnerTeamId ?? null,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        scoreTeamA: m.scoreTeamA ?? null,
        scoreTeamB: m.scoreTeamB ?? null
      }))
      .sort((a, b) => {
        const ra = a.round ?? -1;
        const rb = b.round ?? -1;
        if (ra !== rb) return rb - ra;
        return b.matchId - a.matchId;
      })
      .slice(0, 5);

    const stats = {
      teamCount,
      matchCount,
      completedMatchCount
    };

    const overview: SeasonOverviewResponse = {
      season: {
        id: season.id,
        leagueId: season.leagueId,
        name: season.name,
        description: season.description,
        status: season.status,
        formatType: season.formatType,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        createdAt: season.createdAt
      },
      stats,
      upcomingMatches,
      recentResults
    };

    if (yourTeamRow) {
      overview.yourTeam = {
        teamId: yourTeamRow.id,
        name: yourTeamRow.name,
        logoUrl: yourTeamRow.logoUrl
      };
    }

    return overview;
  },

  /**
   * PATCH /seasons/:seasonId
   */
  updateSeason(
    seasonId: number,
    user: AppUser,
    body: SeasonUpdateBody
  ): SeasonOverviewResponse {
    const existing = seasonsRepo.getSeasonById(seasonId);
    if (!existing) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (existing.leagueId != null) {
      assertCanEditSeason(user, existing.leagueId);
    } else {
      if (user.role !== "superadmin") {
        const err = new Error("Season is not associated with a league");
        (err as any).statusCode = 500;
        throw err;
      }
    }

    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (trimmed.length < 2) {
        const err = new Error("Season name must be at least 2 characters");
        (err as any).statusCode = 400;
        throw err;
      }
      body = { ...body, name: trimmed };
    }

    if (body.startsAt !== undefined) {
      body = { ...body, startsAt: parseOptionalIsoDate("startsAt", body.startsAt) };
    }
    if (body.endsAt !== undefined) {
      body = { ...body, endsAt: parseOptionalIsoDate("endsAt", body.endsAt) };
    }

    const updated = seasonsRepo.updateSeason(seasonId, body);
    if (!updated) {
      const err = new Error("Failed to update season");
      (err as any).statusCode = 500;
      throw err;
    }

    return this.getSeasonOverview(seasonId, user);
  },

  /**
   * GET /seasons/:seasonId/teams
   */
  getSeasonTeams(seasonId: number, _user: AppUser): SeasonTeamsResponse {
    const season = mustGetSeason(seasonId);
    const rows = teamsRepo.listSeasonTeams(season.id);

    const summaries: SeasonTeamSummary[] = rows.map((team) => {
      const matches = teamsRepo.listTeamMatches(season.id, team.id);

      let wins = 0;
      let losses = 0;
      let draws = 0;

      for (const m of matches) {
        if (m.status !== "Completed") continue;

        if (m.winnerTeamId == null) {
          draws++;
        } else if (m.winnerTeamId === team.id) {
          wins++;
        } else {
          losses++;
        }
      }

      const points = wins * 3 + draws * 1;

      return {
        teamId: team.id,
        name: team.name,
        logoUrl: team.logoUrl,
        managerUserId: team.userId,
        managerDisplayName: null,
        record: { wins, losses, draws, points }
      };
    });

    return {
      seasonId: season.id,
      teams: summaries
    };
  },

  /**
   * GET /seasons/:seasonId/settings
   * owner/commissioner
   */
  getSeasonSettings(seasonId: number, user: AppUser): SeasonSettingsResponse {
    const season = mustGetSeason(seasonId);

    if (season.leagueId != null) {
      assertCanEditSeason(user, season.leagueId);
    } else if (user.role !== "superadmin") {
      const err = new Error("Season is not associated with a league");
      (err as any).statusCode = 500;
      throw err;
    }

    const settings = seasonsRepo.getSeasonSettings(seasonId);
    return { seasonId, settings };
  },

  /**
   * PATCH /seasons/:seasonId/settings
   * owner/commissioner
   */
  updateSeasonSettings(
    seasonId: number,
    user: AppUser,
    body: UpdateSeasonSettingsBody
  ): SeasonSettingsResponse {
    const season = mustGetSeason(seasonId);

    if (season.leagueId != null) {
      assertCanEditSeason(user, season.leagueId);
    } else if (user.role !== "superadmin") {
      const err = new Error("Season is not associated with a league");
      (err as any).statusCode = 500;
      throw err;
    }

    const patch: UpdateSeasonSettingsBody = { ...body };

    if (patch.pickTimerSeconds !== undefined) {
      if (
        !Number.isInteger(patch.pickTimerSeconds) ||
        patch.pickTimerSeconds < 10 ||
        patch.pickTimerSeconds > 3600
      ) {
        const err = new Error("pickTimerSeconds must be an integer between 10 and 3600");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    if (patch.roundCount !== undefined) {
      if (!Number.isInteger(patch.roundCount) || patch.roundCount < 1 || patch.roundCount > 200) {
        const err = new Error("roundCount must be an integer between 1 and 200");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    if (patch.draftType !== undefined) {
      if (patch.draftType !== "Snake" && patch.draftType !== "Linear") {
        const err = new Error("draftType must be Snake or Linear");
        (err as any).statusCode = 400;
        throw err;
      }
    }

    if (patch.tradeDeadlineAt !== undefined) {
      patch.tradeDeadlineAt = parseOptionalIsoDate("tradeDeadlineAt", patch.tradeDeadlineAt);
    }

    const settings = seasonsRepo.updateSeasonSettings(seasonId, patch);
    return { seasonId, settings };
  },

  /**
   * POST /seasons/:seasonId/matches/generate
   * RoundRobin schedule generator (design default).
   * owner/commissioner
   *
   * Note: Your routes currently call matchesService.generateSeasonMatches().
   * This remains available and can be wired (or removed later) once we unify.
   */
  generateSchedule(
    seasonId: number,
    user: AppUser,
    body: GenerateScheduleBody
  ): SeasonCalendarResponse {
    const season = mustGetSeason(seasonId);

    if (season.leagueId != null) {
      assertCanEditSeason(user, season.leagueId);
    } else if (user.role !== "superadmin") {
      const err = new Error("Season is not associated with a league");
      (err as any).statusCode = 500;
      throw err;
    }

    if (season.formatType !== "RoundRobin") {
      const err = new Error(
        `Schedule generation not implemented for formatType ${season.formatType}`
      );
      (err as any).statusCode = 409;
      throw err;
    }

    const teams = teamsRepo.listSeasonTeams(seasonId);
    if (teams.length < 2) {
      const err = new Error("At least 2 teams are required to generate a schedule");
      (err as any).statusCode = 409;
      throw err;
    }

    const teamIds = teams.map((t) => t.id);
    const rounds = buildRoundRobinRounds(teamIds);

    const cadenceDays = body.cadenceDays ?? 7;
    if (!Number.isInteger(cadenceDays) || cadenceDays < 1 || cadenceDays > 30) {
      const err = new Error("cadenceDays must be an integer between 1 and 30");
      (err as any).statusCode = 400;
      throw err;
    }

    const startAt = body.startAt ? parseOptionalIsoDate("startAt", body.startAt) : null;
    const base = startAt ?? new Date().toISOString();

    teamsRepo.deleteSeasonMatches(seasonId);

    let roundAt = base;

    for (let r = 0; r < rounds.length; r++) {
      const roundNo = r + 1;
      const pairings = rounds[r];

      for (const [teamAId, teamBId] of pairings) {
        teamsRepo.createMatch({
          seasonId,
          round: roundNo,
          scheduledAt: roundAt,
          teamAId,
          teamBId
        });
      }

      roundAt = addDays(roundAt, cadenceDays);
    }

    return this.getSeasonCalendar(seasonId, user);
  },

  /**
   * GET /seasons/:seasonId/matches/calendar
   */
  getSeasonCalendar(seasonId: number, _user: AppUser): SeasonCalendarResponse {
    const season = mustGetSeason(seasonId);

    const seasonTeams = teamsRepo.listSeasonTeams(season.id);
    const seenMatchIds = new Set<number>();
    const matches: SeasonCalendarMatch[] = [];

    for (const t of seasonTeams) {
      const ms = teamsRepo.listTeamMatches(season.id, t.id);
      for (const m of ms) {
        if (seenMatchIds.has(m.id)) continue;
        seenMatchIds.add(m.id);

        matches.push({
          matchId: m.id,
          round: m.round ?? null,
          scheduledAt: m.scheduledAt ?? null,
          teamAId: m.teamAId,
          teamBId: m.teamBId,
          status: m.status
        });
      }
    }

    matches.sort((a, b) => {
      const ra = a.round ?? 0;
      const rb = b.round ?? 0;
      if (ra !== rb) return ra - rb;
      const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

    return { seasonId: season.id, matches };
  },

  /**
   * GET /seasons/:seasonId/standings
   * Delegate to canonical standings module to avoid drift.
   */
  getStandings(
    seasonId: number,
    user: AppUser,
    query: SeasonStandingsQuery
  ): SeasonStandingsResponse {
    return seasonStandingsService.getSeasonStandings(seasonId, user, query);
  },

  /**
   * POST /seasons/:seasonId/standings/recalculate
   * owner/commissioner
   *
   * For now: returns freshly computed standings rows.
   */
  recalculateStandings(
    seasonId: number,
    user: AppUser
  ): SeasonStandingsRecalculateResponse {
    const season = mustGetSeason(seasonId);

    if (season.leagueId != null) {
      assertCanEditSeason(user, season.leagueId);
    } else if (user.role !== "superadmin") {
      const err = new Error("Season is not associated with a league");
      (err as any).statusCode = 500;
      throw err;
    }

    const standings = seasonStandingsService.getSeasonStandings(seasonId, user, {
      sortBy: "points"
    });

    return { seasonId, rows: standings.rows };
  }
};
