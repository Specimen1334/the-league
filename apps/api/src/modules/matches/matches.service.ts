// apps/api/src/modules/matches/matches.service.ts
import type { AppUser } from "../../shared/types";
import { matchesRepo } from "./matches.repo";
import { matchesRecordingService } from "./matches.recording.service";
import { teamsRepo } from "../teams/teams.repo";
import { seasonsRepo } from "../seasons/seasons.repo";
import { seasonStandingsService } from "../seasons/seasons.standings";
import { getLeagueRoleOrNull, assertLeagueRole } from "../../shared/permissions";
import type {
  MatchOverviewResponse,
  MatchLineupsResponse,
  FinalSheetsResponse,
  ProposeResultBody,
  VoteOnResultBody,
  AdminOverrideResultBody,
  AdminUpdateMatchBody,
  MatchResultSummary,
  MatchResultProposal,
  MatchTeamLineup,
  MatchPhase,
  SeasonMatchesQuery,
  SeasonMatchesResponse,
  SeasonMatchCalendarQuery,
  SeasonMatchCalendarResponse,
  GenerateSeasonMatchesBody,
  GenerateSeasonMatchesResponse,
  CreateMatchBody,
  ImportMatchesBody,
  ImportMatchesResponse,
  MatchUpdateBody,
  SeasonMatchView
} from "./matches.schemas";

function isLeagueCommissioner(user: AppUser, leagueId: number | null): boolean {
  if (user.role === "superadmin") return true;
  if (!leagueId) return false;
  const role = getLeagueRoleOrNull(leagueId, user.id);
  return role === "owner" || role === "commissioner";
}

function assertMatchAdmin(user: AppUser, leagueId: number | null) {
  if (user.role === "superadmin") return;
  if (!leagueId) {
    const err = new Error("Match is not associated with a league");
    (err as any).statusCode = 500;
    throw err;
  }
  assertLeagueRole(user, leagueId, ["owner", "commissioner"]);
}

export const matchesService = {
  /**
   * GET /matches/:matchId
   */
  getMatchOverview(matchId: number, user: AppUser): MatchOverviewResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const teamA = teamsRepo.getTeamById(match.teamAId);
    const teamB = teamsRepo.getTeamById(match.teamBId);

    if (!teamA || !teamB) {
      const err = new Error("Match teams not found");
      (err as any).statusCode = 500;
      throw err;
    }

    const isTeamA = teamA.userId === user.id;
    const isTeamB = teamB.userId === user.id;

    const resultSummary: MatchResultSummary = {
      scoreTeamA: match.scoreTeamA,
      scoreTeamB: match.scoreTeamB,
      winnerTeamId: match.winnerTeamId,
      status:
        match.status === "Completed"
          ? "Decided"
          : match.status === "Voided"
          ? "Voided"
          : match.status === "UnderReview"
          ? "UnderReview"
          : "Pending"
    };

    const rawResults = matchesRepo.listMatchResults(match.id);

    const proposals: MatchResultProposal[] = rawResults.map((r) => {
      const votes = matchesRepo.listResultVotes(r.id);
      const approvals = votes.filter((v) => v.vote === "up").length;
      const rejections = votes.filter((v) => v.vote === "down").length;

      const yourVoteRow = matchesRepo.getUserVoteForResult(r.id, user.id);

      return {
        id: r.id,
        matchId: r.matchId,
        submittedByTeamId: r.submittedByTeamId,
        submittedByUserId: r.submittedByUserId,
        createdAt: r.createdAt,
        status: r.status,
        scoreTeamA: r.scoreTeamA,
        scoreTeamB: r.scoreTeamB,
        winnerTeamId: r.winnerTeamId,
        notes: r.notes,
        approvals,
        rejections,
        yourVote: yourVoteRow ? yourVoteRow.vote : null
      };
    });

    return {
      match: {
        id: match.id,
        seasonId: match.seasonId,
        leagueId: match.leagueId,
        round: match.round,
        scheduledAt: match.scheduledAt,
        status: match.status,
        createdAt: match.createdAt
      },
      teamA: {
        teamId: teamA.id,
        name: teamA.name,
        logoUrl: teamA.logoUrl,
        managerUserId: teamA.userId,
        managerDisplayName: null
      },
      teamB: {
        teamId: teamB.id,
        name: teamB.name,
        logoUrl: teamB.logoUrl,
        managerUserId: teamB.userId,
        managerDisplayName: null
      },
      result: resultSummary,
      proposals,
      viewerPerspective: {
        isTeamA,
        isTeamB,
        isCommissioner: isLeagueCommissioner(user, match.leagueId ?? null)
      }
    };
  },

  /**
   * GET /matches/:matchId/lineups
   */
  getMatchLineups(matchId: number, user: AppUser): MatchLineupsResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const teamA = teamsRepo.getTeamById(match.teamAId);
    const teamB = teamsRepo.getTeamById(match.teamBId);
    if (!teamA || !teamB) {
      const err = new Error("Match teams not found");
      (err as any).statusCode = 500;
      throw err;
    }

    const yourTeamId =
      teamA.userId === user.id ? teamA.id : teamB.userId === user.id ? teamB.id : null;

    const phase: MatchPhase =
      match.status === "Completed"
        ? "Completed"
        : match.status === "InProgress" || match.status === "AwaitingResult"
        ? "Locked"
        : "PreLock";

    // If no round set, there's nothing to show yet.
    if (!Number.isInteger(match.round) || match.round == null) {
      const teamsLineups: MatchTeamLineup[] = [
        {
          teamId: teamA.id,
          name: teamA.name,
          lineupStatus: "NotSubmitted",
          slots: []
        },
        {
          teamId: teamB.id,
          name: teamB.name,
          lineupStatus: "NotSubmitted",
          slots: []
        }
      ];

      return {
        matchId: match.id,
        seasonId: match.seasonId,
        phase,
        yourTeamId,
        teams: teamsLineups
      };
    }

    const lineups = matchesRepo.getLineupsForMatch(
      match.seasonId,
      match.round,
      teamA.id,
      teamB.id
    );

    const teamALineupRow = lineups.find((l) => l.teamId === teamA.id);
    const teamBLineupRow = lineups.find((l) => l.teamId === teamB.id);

    const teamARoster = teamsRepo.listTeamRoster(teamA.id);
    const teamBRoster = teamsRepo.listTeamRoster(teamB.id);

    const teamALineup = buildTeamLineup(
      teamA,
      teamALineupRow,
      teamARoster,
      phase,
      yourTeamId
    );
    const teamBLineup = buildTeamLineup(
      teamB,
      teamBLineupRow,
      teamBRoster,
      phase,
      yourTeamId
    );

    return {
      matchId: match.id,
      seasonId: match.seasonId,
      phase,
      yourTeamId,
      teams: [teamALineup, teamBLineup]
    };
  },

  /**
   * GET /matches/:matchId/final-sheets
   */
  getFinalSheets(matchId: number, user: AppUser): FinalSheetsResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const teamA = teamsRepo.getTeamById(match.teamAId);
    const teamB = teamsRepo.getTeamById(match.teamBId);
    if (!teamA || !teamB) {
      const err = new Error("Match teams not found");
      (err as any).statusCode = 500;
      throw err;
    }

    const isTeamAUser = teamA.userId === user.id;
    const isTeamBUser = teamB.userId === user.id;

    // Only participants or league commissioners can view final sheets.
    if (!isTeamAUser && !isTeamBUser && !isLeagueCommissioner(user, match.leagueId ?? null)) {
      const err = new Error("You cannot view these sheets");
      (err as any).statusCode = 403;
      throw err;
    }

    return matchesRecordingService.getFinalSheets(matchId, user);
  },

  /**
   * POST /matches/:matchId/results/propose
   */
  proposeResult(
    matchId: number,
    user: AppUser,
    body: ProposeResultBody
  ): MatchOverviewResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const teamA = teamsRepo.getTeamById(match.teamAId);
    const teamB = teamsRepo.getTeamById(match.teamBId);
    if (!teamA || !teamB) {
      const err = new Error("Match teams not found");
      (err as any).statusCode = 500;
      throw err;
    }

    // Only participants (or league commissioners) can propose a result.
    const isTeamAUser = teamA.userId === user.id;
    const isTeamBUser = teamB.userId === user.id;

    if (!isTeamAUser && !isTeamBUser && !isLeagueCommissioner(user, match.leagueId ?? null)) {
      const err = new Error("You cannot submit results for this match");
      (err as any).statusCode = 403;
      throw err;
    }

    if (!Number.isInteger(body.scoreTeamA) || !Number.isInteger(body.scoreTeamB)) {
      const err = new Error("Scores must be integers");
      (err as any).statusCode = 400;
      throw err;
    }

    const submittedByTeamId = isTeamAUser
      ? teamA.id
      : isTeamBUser
      ? teamB.id
      : body.winnerTeamId ?? teamA.id;

    const gameBreakdownJson =
      body.gameBreakdown && body.gameBreakdown.length > 0
        ? JSON.stringify(body.gameBreakdown)
        : null;

    matchesRepo.createMatchResult({
      matchId: match.id,
      submittedByTeamId,
      submittedByUserId: user.id,
      scoreTeamA: body.scoreTeamA,
      scoreTeamB: body.scoreTeamB,
      winnerTeamId: body.winnerTeamId,
      notes: body.notes ?? null,
      gameBreakdownJson
    });

    return this.getMatchOverview(matchId, user);
  },

  /**
   * POST /matches/:matchId/results/:resultId/vote
   */
  voteOnResult(
    matchId: number,
    resultId: number,
    user: AppUser,
    body: VoteOnResultBody
  ): MatchOverviewResponse {
    if (body.vote !== "up" && body.vote !== "down") {
      const err = new Error("vote must be 'up' or 'down'");
      (err as any).statusCode = 400;
      throw err;
    }

    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const result = matchesRepo.getResultById(match.id, resultId);
    if (!result) {
      const err = new Error("Result not found");
      (err as any).statusCode = 404;
      throw err;
    }

    matchesRepo.addResultVote({
      resultId: result.id,
      userId: user.id,
      vote: body.vote,
      comment: body.comment
    });

    return this.getMatchOverview(matchId, user);
  },

  /**
   * POST /matches/:matchId/admin/override-result
   */
  adminOverrideResult(
    matchId: number,
    user: AppUser,
    body: AdminOverrideResultBody
  ): MatchOverviewResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    assertMatchAdmin(user, match.leagueId ?? null);

    const updated = matchesRepo.overrideMatchResult(
      match.id,
      body.winnerTeamId,
      body.scoreTeamA,
      body.scoreTeamB
    );
    if (!updated) {
      const err = new Error("Failed to override result");
      (err as any).statusCode = 500;
      throw err;
    }

    return this.getMatchOverview(matchId, user);
  },

  /**
   * POST /matches/:matchId/admin/reset
   */
  adminResetMatch(matchId: number, user: AppUser): void {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    assertMatchAdmin(user, match.leagueId ?? null);

    matchesRepo.resetMatch(match.id);
  },

  /**
   * PATCH /matches/:matchId/admin
   */
  adminUpdateMatch(
    matchId: number,
    user: AppUser,
    body: AdminUpdateMatchBody
  ): MatchOverviewResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    assertMatchAdmin(user, match.leagueId ?? null);

    const updated = matchesRepo.updateMatchAdmin(match.id, body);
    if (!updated) {
      const err = new Error("Failed to update match");
      (err as any).statusCode = 500;
      throw err;
    }

    return this.getMatchOverview(matchId, user);
  },

  // ----- Season scheduling / contract spine -----

  listSeasonMatches(
    seasonIdParam: string,
    user: AppUser,
    query: SeasonMatchesQuery
  ): SeasonMatchesResponse {
    const seasonId = parseId(seasonIdParam, "seasonId");
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) notFound("Season not found");

    // Auth: any member of the league (or superadmin) can view matches.
    // If leagueId is null, allow (legacy); otherwise require membership.
    if (user.role !== "superadmin" && season.leagueId) {
      // Throws 403 if not a member
      assertLeagueRole(user, season.leagueId, [
        "owner",
        "commissioner",
        "member"
      ]);
    }

    const rowsAll = matchesRepo.listSeasonMatches(seasonId, {
      round: query.round,
      status: query.status
    });

    const rows = query.teamId
      ? (rowsAll as any[]).filter((m) => m.teamAId === query.teamId || m.teamBId === query.teamId)
      : (rowsAll as any[]);

    return {
      matches: rows.map(toSeasonMatchView)
    };
  },

  getSeasonMatchCalendar(
    seasonIdParam: string,
    user: AppUser,
    query: SeasonMatchCalendarQuery
  ): SeasonMatchCalendarResponse {
    const seasonId = parseId(seasonIdParam, "seasonId");
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) notFound("Season not found");

    if (user.role !== "superadmin" && season.leagueId) {
      assertLeagueRole(user, season.leagueId, [
        "owner",
        "commissioner",
        "member"
      ]);
    }

    const rows = matchesRepo.listSeasonMatches(seasonId, {});
    const from = query.from ? new Date(query.from + "T00:00:00Z") : null;
    const to = query.to ? new Date(query.to + "T23:59:59Z") : null;

    const filtered = rows.filter((r: any) => {
      if (!r.scheduledAt) return true;
      const d = new Date(r.scheduledAt);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });

    const map = new Map<string, SeasonMatchView[]>();
    for (const r of filtered) {
      const dateKey = r.scheduledAt ? String(r.scheduledAt).slice(0, 10) : "TBD";
      const arr = map.get(dateKey) ?? [];
      arr.push(toSeasonMatchView(r));
      map.set(dateKey, arr);
    }

    const days = Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, matches]) => ({ date, matches }));

    return { days };
  },

  generateSeasonMatches(
    seasonIdParam: string,
    user: AppUser,
    body: GenerateSeasonMatchesBody
  ): GenerateSeasonMatchesResponse {
    const seasonId = parseId(seasonIdParam, "seasonId");
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) notFound("Season not found");

    assertSeasonCommissioner(user, season.leagueId);

    const settings = seasonsRepo.getSeasonSettings(seasonId) as any;
    const competition = settings?.competition ?? settings?.schedule ?? null;

    if (!competition) badRequest("Missing season competition settings");

    const teams = teamsRepo.listSeasonTeams(seasonId);
    if (teams.length < 2) badRequest("Need at least 2 teams to generate matches");

    const leagueId = season.leagueId;
    if (!leagueId) {
      const err = new Error("Season is not attached to a league");
      (err as any).statusCode = 500;
      throw err;
    }

    // Regenerate means wipe existing matches before rebuilding.
    const regenerate = body.regenerate ?? true;
    let cleared = 0;
    if (regenerate) {
      const existing = matchesRepo.listSeasonMatches(seasonId, {});
      cleared = existing.length;
      matchesRepo.deleteAllSeasonMatches(seasonId);
    }

    const comp = normalizeCompetition(competition);

    const scheduleDates = buildScheduleDates(comp, teams.length);

    const regular = buildRegularSeason(comp, teams.map((t) => t.id), scheduleDates);

    // Optional playoffs: only generated if enabled AND seeding is not manual.
    let playoffs: GeneratedMatch[] = [];
    if (comp.playoffs?.enabled) {
      if (comp.playoffs.seeding === "manual") {
        // Manual playoffs must be created via POST /matches or /import
        // (generation intentionally skips to avoid silent wrong seeding).
      } else {
        const seededTeamIds = seedTeamsForPlayoffs(
          seasonId,
          user,
          comp.playoffs.seeding,
          comp.playoffs.teams,
          teams.map((t) => t.id)
        );
        playoffs = buildPlayoffs(
          comp.playoffs.type,
          seededTeamIds,
          scheduleDates,
          regular.maxRound + 1
        );
      }
    }

    const all = [...regular.matches, ...playoffs];

    for (const m of all) {
      matchesRepo.createSeasonMatch({
        leagueId,
        seasonId,
        round: m.round,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        scheduledAt: m.scheduledAt,
        status: "Scheduled"
      });
    }

    return { created: all.length, cleared };
  },

  createMatch(
    seasonIdParam: string,
    user: AppUser,
    body: CreateMatchBody
  ): SeasonMatchView {
    const seasonId = parseId(seasonIdParam, "seasonId");
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) notFound("Season not found");

    assertSeasonCommissioner(user, season.leagueId);

    if (!season.leagueId) {
      const err = new Error("Season is not attached to a league");
      (err as any).statusCode = 500;
      throw err;
    }

    const week = body.week;
    if (!Number.isInteger(week) || week <= 0) badRequest("Invalid week");

    const row = matchesRepo.createSeasonMatch({
      leagueId: season.leagueId,
      seasonId,
      round: week,
      teamAId: body.homeTeamId,
      teamBId: body.awayTeamId,
      scheduledAt: body.scheduledFor ?? null,
      status: "Scheduled"
    });

    return toSeasonMatchView(row);
  },

  importMatches(
    seasonIdParam: string,
    user: AppUser,
    body: ImportMatchesBody
  ): ImportMatchesResponse {
    const seasonId = parseId(seasonIdParam, "seasonId");
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) notFound("Season not found");
    assertSeasonCommissioner(user, season.leagueId);

    if (!season.leagueId) {
      const err = new Error("Season is not attached to a league");
      (err as any).statusCode = 500;
      throw err;
    }

    if (body.mode === "replace") {
      const existing = matchesRepo.listSeasonMatches(seasonId, {});
      matchesRepo.deleteAllSeasonMatches(seasonId);
      let created = 0;
      for (const m of body.matches) {
        matchesRepo.createSeasonMatch({
          leagueId: season.leagueId,
          seasonId,
          round: m.week,
          teamAId: m.homeTeamId,
          teamBId: m.awayTeamId,
          scheduledAt: m.scheduledFor ?? null,
          status: "Scheduled"
        });
        created++;
      }
      return { created, replaced: existing.length };
    }

    // append
    let created = 0;
    for (const m of body.matches) {
      matchesRepo.createSeasonMatch({
        leagueId: season.leagueId,
        seasonId,
        round: m.week,
        teamAId: m.homeTeamId,
        teamBId: m.awayTeamId,
        scheduledAt: m.scheduledFor ?? null,
        status: "Scheduled"
      });
      created++;
    }
    return { created };
  },

  updateMatch(
    seasonIdParam: string,
    matchIdParam: string,
    user: AppUser,
    body: MatchUpdateBody
  ): SeasonMatchView {
    const seasonId = parseId(seasonIdParam, "seasonId");
    const matchId = parseId(matchIdParam, "matchId");
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) notFound("Season not found");
    assertSeasonCommissioner(user, season.leagueId);

    const updated = matchesRepo.updateSeasonMatch({
      matchId,
      scheduledAt: body.scheduledFor ?? null,
      status: (body.status ?? null) as any
    });

    if (!updated) notFound("Match not found");

    return toSeasonMatchView(updated);
  }

};



type GeneratedMatch = {
  round: number;
  teamAId: number | null;
  teamBId: number | null;
  scheduledAt: string | null;
};

function parseId(raw: string, name: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    badRequest(`Invalid ${name}`);
  }
  return n;
}

function badRequest(message: string): never {
  const err = new Error(message);
  (err as any).statusCode = 400;
  throw err;
}

function notFound(message: string): never {
  const err = new Error(message);
  (err as any).statusCode = 404;
  throw err;
}

function safeJson(raw?: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function assertSeasonCommissioner(user: AppUser, leagueId: number | null) {
  if (user.role === "superadmin") return;
  if (!leagueId) badRequest("Season is not attached to a league");
  assertLeagueRole(user, leagueId, ["owner", "commissioner"]);
}

function toSeasonMatchView(r: any): SeasonMatchView {
  return {
    id: r.id,
    seasonId: r.seasonId,
    leagueId: r.leagueId,
    round: r.round ?? null,
    teamAId: r.teamAId ?? null,
    teamBId: r.teamBId ?? null,
    scheduledAt: r.scheduledAt ?? null,
    status: r.status,
    winnerTeamId: r.winnerTeamId ?? null,
    scoreTeamA: r.scoreTeamA ?? null,
    scoreTeamB: r.scoreTeamB ?? null
  };
}

function normalizeCompetition(raw: any) {
  const schedule = raw.schedule ?? raw;
  const format = raw.format ?? raw.regularSeason ?? raw;
  const playoffs = raw.playoffs ?? raw.postseason ?? null;

  return {
    formatType: String(format.type ?? format.format ?? raw.formatType ?? raw.type ?? "straight_round_robin"),
    legs: Number(format.legs ?? 1),
    schedule: {
      cadence: String(schedule.cadence ?? "weekly"),
      startDate: schedule.startDate ?? schedule.startAt ?? null,
      customDates: Array.isArray(schedule.customDates) ? schedule.customDates : null
    },
    playoffs: playoffs
      ? {
          enabled: Boolean(playoffs.enabled),
          type: String(playoffs.type ?? "single_elimination"),
          teams: Number(playoffs.teams ?? 0),
          seeding: String(playoffs.seeding ?? "record")
        }
      : null
  };
}

function buildScheduleDates(comp: any, teamCount: number): string[] {
  const roundsNeeded = estimateTotalRounds(comp, teamCount);
  if (comp.schedule.customDates && comp.schedule.customDates.length > 0) {
    return comp.schedule.customDates.slice(0, roundsNeeded);
  }

  const start = comp.schedule.startDate ? new Date(comp.schedule.startDate) : new Date();
  const cadenceDays =
    comp.schedule.cadence === "fortnightly"
      ? 14
      : comp.schedule.cadence === "monthly"
      ? 30
      : comp.schedule.cadence === "bimonthly"
      ? 60
      : comp.schedule.cadence === "custom"
      ? 7
      : 7;

  const dates: string[] = [];
  for (let i = 0; i < roundsNeeded; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i * cadenceDays);
    dates.push(d.toISOString());
  }
  return dates;
}

function estimateRegularSeasonRounds(comp: any, teamCount: number): number {
  const n = teamCount;
  const rrRounds = n % 2 === 0 ? n - 1 : n; // includes bye round for odd
  const base = rrRounds * Math.max(1, comp.legs);

  switch (comp.formatType) {
    case "straight_round_robin":
      return base;
    case "round_robin_double_split":
      return base * 2;
    case "round_robin_triple_split":
      return base * 3;
    case "round_robin_quadruple_split":
      return base * 4;
    case "semi_round_robins":
      return Math.ceil(base / 2);
    case "extended":
      return base + Math.ceil(base / 2);
    case "single_elimination":
      return Math.ceil(Math.log2(nextPow2(n)));
    case "double_elimination":
      // simple estimate; winners rounds + losers rounds
      return Math.ceil(Math.log2(nextPow2(n))) * 2;
    case "multi_level":
      return base;
    default:
      return base;
  }
}

function estimateTotalRounds(comp: any, teamCount: number): number {
  const regular = estimateRegularSeasonRounds(comp, teamCount);
  if (!comp.playoffs?.enabled) return regular;

  const playoffTeams = Math.max(2, Number(comp.playoffs.teams ?? 0));
  const pr = comp.playoffs.type === "double_elimination"
    ? Math.ceil(Math.log2(nextPow2(playoffTeams))) * 2
    : Math.ceil(Math.log2(nextPow2(playoffTeams)));
  return regular + pr;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function roundRobinRounds(teamIds: number[]): number[][][] {
  const teams = [...teamIds];
  const hasBye = teams.length % 2 === 1;
  if (hasBye) teams.push(-1);

  const n = teams.length;
  const rounds: number[][][] = [];
  const half = n / 2;

  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairs: number[][] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== -1 && b !== -1) pairs.push([a, b]);
    }
    rounds.push(pairs);

    // rotate all but first
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as number);
    arr.splice(0, n, fixed, ...rest);
  }

  return rounds;
}

function buildRegularSeason(
  comp: any,
  teamIds: number[],
  dates: string[]
): { matches: GeneratedMatch[]; maxRound: number } {
  const type = comp.formatType;
  const legs = Math.max(1, comp.legs);

  if (type === "single_elimination" || type === "double_elimination") {
    const rounds = type === "double_elimination"
      ? buildDoubleElimSkeleton(teamIds, dates, 1)
      : buildSingleElimBracket(teamIds, dates, 1);
    const maxRound = rounds.reduce((m, x) => Math.max(m, x.round), 0);
    return { matches: rounds, maxRound };
  }

  // group stage default to round robin variants
  const baseRounds = roundRobinRounds(teamIds); // rounds -> pairs
  const perLeg: number[][][] = [];
  for (let l = 0; l < legs; l++) perLeg.push(...baseRounds);

  let rr = perLeg;

  if (type === "round_robin_double_split") rr = [...perLeg, ...perLeg];
  if (type === "round_robin_triple_split") rr = [...perLeg, ...perLeg, ...perLeg];
  if (type === "round_robin_quadruple_split") rr = [...perLeg, ...perLeg, ...perLeg, ...perLeg];
  if (type === "semi_round_robins") rr = rr.slice(0, Math.ceil(rr.length / 2));
  if (type === "extended") rr = rr.concat(rr.slice(0, Math.ceil(rr.length / 2)));

  const matches: GeneratedMatch[] = [];
  let roundNum = 1;
  for (const roundPairs of rr) {
    const scheduledAt = dates[roundNum - 1] ?? null;
    for (const [a, b] of roundPairs) {
      matches.push({
        round: roundNum,
        teamAId: a,
        teamBId: b,
        scheduledAt
      });
    }
    roundNum++;
  }

  return { matches, maxRound: roundNum - 1 };
}

function buildSingleElimBracket(
  seededTeamIds: number[],
  dates: string[],
  startingRound: number
): GeneratedMatch[] {
  const n = seededTeamIds.length;
  const size = nextPow2(n);
  const rounds = Math.log2(size);

  const seeds = [...seededTeamIds];
  while (seeds.length < size) seeds.push(-1); // bye placeholders

  // Standard seeding: 1vN, 2vN-1 etc
  const firstRoundPairs: Array<[number | null, number | null]> = [];
  for (let i = 0; i < size / 2; i++) {
    const a = seeds[i];
    const b = seeds[size - 1 - i];
    firstRoundPairs.push([a === -1 ? null : a, b === -1 ? null : b]);
  }

  const out: GeneratedMatch[] = [];
  let round = startingRound;

  // Round 1 with known seeds
  for (const [a, b] of firstRoundPairs) {
    if (a && b) {
      out.push({ round, teamAId: a, teamBId: b, scheduledAt: dates[round - 1] ?? null });
    } else {
      // bye: we still create a placeholder match? no, skip.
    }
  }
  round++;

  // Subsequent rounds are placeholders (participants TBD)
  for (; round < startingRound + rounds; round++) {
    const matchesThisRound = size / 2 ** (round - startingRound + 1);
    for (let i = 0; i < matchesThisRound; i++) {
      out.push({
        round,
        teamAId: null,
        teamBId: null,
        scheduledAt: dates[round - 1] ?? null
      });
    }
  }

  return out;
}

function buildDoubleElimSkeleton(
  seededTeamIds: number[],
  dates: string[],
  startingRound: number
): GeneratedMatch[] {
  // Simplified skeleton: winners bracket (single elim) + losers bracket placeholders.
  const winners = buildSingleElimBracket(seededTeamIds, dates, startingRound);
  const wbRounds = estimateRegularSeasonRounds({ formatType: "single_elimination", legs: 1 }, seededTeamIds.length);

  const size = nextPow2(seededTeamIds.length);
  const losersRounds = wbRounds; // simplified
  const out = [...winners];

  let round = startingRound + wbRounds;
  for (let lr = 0; lr < losersRounds; lr++, round++) {
    const matchesThisRound = Math.max(1, size / 4);
    for (let i = 0; i < matchesThisRound; i++) {
      out.push({
        round,
        teamAId: null,
        teamBId: null,
        scheduledAt: dates[round - 1] ?? null
      });
    }
  }

  // Grand final placeholder
  out.push({
    round,
    teamAId: null,
    teamBId: null,
    scheduledAt: dates[round - 1] ?? null
  });

  return out;
}

function seedTeamsForPlayoffs(
  seasonId: number,
  user: AppUser,
  mode: string,
  teams: number,
  fallbackTeamIds: number[]
): number[] {
  const count = Math.max(2, Number(teams || 0));
  if (mode === "record" || mode === "points_for" || mode === "points") {
    try {
      const standings = seasonStandingsService.getSeasonStandings(seasonId, user, { sortBy: "points" } as any);
      const ids = standings.rows.map((r: any) => r.teamId).slice(0, count);
      if (ids.length >= 2) return ids;
    } catch {
      // fall back
    }
  }
  return fallbackTeamIds.slice(0, count);
}

function buildPlayoffs(
  type: string,
  seededTeamIds: number[],
  dates: string[],
  startingRound: number
): GeneratedMatch[] {
  if (type === "double_elimination") return buildDoubleElimSkeleton(seededTeamIds, dates, startingRound);
  return buildSingleElimBracket(seededTeamIds, dates, startingRound);
}


function buildTeamLineup(
  team: { id: number; name: string },
  lineupRow:
    | ReturnType<typeof matchesRepo.getLineupsForMatch>[number]
    | undefined,
  roster: ReturnType<typeof teamsRepo.listTeamRoster>,
  phase: MatchPhase,
  yourTeamId: number | null
): MatchTeamLineup {
  const slots = matchesRepo.parseLineupSlots(lineupRow?.lineupJson ?? null);

  const isYours = yourTeamId === team.id;

  const rosterById = new Map(roster.map((r) => [r.pokemonId, r]));

  return {
    teamId: team.id,
    name: team.name,
    lineupStatus: lineupRow ? "Submitted" : "NotSubmitted",
    slots: slots.map((s) => {
      const r = s.pokemonId ? rosterById.get(s.pokemonId) : null;
      return {
        slot: s.slot,
        pokemonId: s.pokemonId,
        nickname: r?.nickname ?? null,
        speciesName: r?.speciesName ?? null,
        itemId: s.itemId ?? null
      };
    }),
    visibility: phase === "PreLock" ? (isYours ? "Full" : "Hidden") : "Full"
  };
}
