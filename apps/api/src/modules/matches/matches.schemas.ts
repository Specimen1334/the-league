// apps/api/src/modules/matches/matches.schemas.ts

/**
 * Match status lifecycle.
 * Mirrors the design doc and admin schemas.
 */
export type MatchStatus =
  | "Scheduled"
  | "InProgress"
  | "AwaitingResult"
  | "Completed"
  | "Voided"
  | "UnderReview"
  | "Archived";

/**
 * Commissioner-level match update body.
 * Used by: PATCH /matches/:matchId/admin
 * (Separate from the global Admin module's dangerous operations.)
 */
export type AdminUpdateMatchBody = {
  scheduledAt?: string | null; // ISO 8601
  status?: MatchStatus;
  teamAId?: number;
  teamBId?: number;
  round?: number | null;
  winnerTeamId?: number | null;
  scoreTeamA?: number | null;
  scoreTeamB?: number | null;
};

/**
 * Result submission body.
 * Used by: POST /matches/:matchId/results
 *
 * "gameBreakdown" lets us record Bo3-style granular outcomes later.
 */
export type ProposeResultBody = {
  winnerTeamId: number | null;
  scoreTeamA: number;
  scoreTeamB: number;
  gameBreakdown?: {
    gameIndex: number; // 1-based index
    winnerTeamId: number | null;
  }[];
  notes?: string;
};

/**
 * Voting on a proposed result.
 * Used by: POST /matches/:matchId/results/:resultId/vote
 */
export type VoteOnResultBody = {
  vote: "up" | "down";
  comment?: string;
};

/**
 * Admin override result body.
 * Used by: POST /matches/:matchId/admin/override-result
 */
export type AdminOverrideResultBody = {
  winnerTeamId: number | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  reason?: string;
};

/**
 * Overview: base team info displayed in Match Hub.
 */
export type MatchTeamInfo = {
  teamId: number;
  name: string;
  logoUrl: string | null;
  managerUserId: number;
  managerDisplayName: string | null;
};

/**
 * Final result summary.
 */
export type MatchResultSummary = {
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  winnerTeamId: number | null;
  status: "Pending" | "Decided" | "Voided" | "UnderReview"
  | "Archived";
};

/**
 * A single proposed result, plus vote summary.
 */
export type MatchResultProposal = {
  id: number;
  matchId: number;
  submittedByTeamId: number;
  submittedByUserId: number;
  createdAt: string;
  status: "Pending" | "Approved" | "Rejected";
  scoreTeamA: number;
  scoreTeamB: number;
  winnerTeamId: number | null;
  notes: string | null;
  approvals: number;
  rejections: number;
  yourVote?: "up" | "down" | null;
};

/**
 * Overview payload for Match Hub Overview tab.
 * Used by: GET /matches/:matchId
 */
export type MatchOverviewResponse = {
  match: {
    id: number;
    seasonId: number;
    leagueId: number | null;
    round: number | null;
    scheduledAt: string | null;
    status: MatchStatus;
    createdAt: string;
  };
  teamA: MatchTeamInfo;
  teamB: MatchTeamInfo;
  result: MatchResultSummary;
  proposals: MatchResultProposal[];
  viewerPerspective: {
    isTeamA: boolean;
    isTeamB: boolean;
    isCommissioner: boolean;
  };
};

/**
 * Lineup visibility / match phase.
 */
export type MatchPhase = "PreLock" | "Locked" | "Completed";

/**
 * A single Pokémon slot in the match lineup view.
 */
export type MatchLineupSlot = {
  pokemonInstanceId: number;
  pokemonId: number;
  speciesName: string | null;
  nickname: string | null;
  /** true if full info is visible to the viewer. */
  isVisibleToViewer: boolean;
};

/**
 * Per-team lineup view for Match Hub lineups tab.
 */
export type MatchTeamLineup = {
  teamId: number;
  name: string;
  lineupStatus: "NotSubmitted" | "Draft" | "Locked" | "Expired";
  slots: MatchLineupSlot[];
};

/**
 * Response for: GET /matches/:matchId/lineups
 */
export type MatchLineupsResponse = {
  matchId: number;
  seasonId: number;
  phase: MatchPhase;
  yourTeamId: number | null;
  teams: MatchTeamLineup[];
};

/**
 * Final sheet Pokémon – "open teams & stats" view.
 */
export type FinalSheetsPokemon = {
  pokemonInstanceId: number;
  pokemonId: number;
  speciesName: string | null;
  nickname: string | null;
  item: string | null;
  ability: string | null;
  nature: string | null;
  moves: string[];
  evs: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  } | null;
};

/**
 * Final sheet per team.
 */
export type FinalSheetsTeam = {
  teamId: number;
  name: string;
  logoUrl: string | null;
  sheet: FinalSheetsPokemon[];
};

/**
 * Response for: GET /matches/:matchId/final-sheets
 */
export type FinalSheetsResponse = {
  matchId: number;
  seasonId: number;
  teams: FinalSheetsTeam[];
};


/**
 * Season match list query.
 */
export type SeasonMatchesQuery = {
  teamId?: number;
  round?: number;
  status?: MatchStatus;
};

/**
 * Minimal match row for season views.
 */
export type SeasonMatchView = {
  id: number;
  seasonId: number;
  leagueId: number;
  round: number | null;
  teamAId: number | null;
  teamBId: number | null;
  scheduledAt: string | null;
  status: MatchStatus;
  winnerTeamId: number | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
};

/**
 * Response type for season match listing.
 */
export type SeasonMatchesResponse = {
  matches: SeasonMatchView[];
};

/**
 * Calendar query.
 */
export type SeasonMatchCalendarQuery = {
  from?: string; // ISO date YYYY-MM-DD
  to?: string; // ISO date YYYY-MM-DD
};

export type SeasonMatchCalendarDay = {
  date: string; // YYYY-MM-DD
  matches: SeasonMatchView[];
};

export type SeasonMatchCalendarResponse = {
  days: SeasonMatchCalendarDay[];
};

/**
 * Season generation request.
 */
export type GenerateSeasonMatchesBody = {
  regenerate?: boolean;
  overrides?: {
    format?: any;
    schedule?: any;
  };
};

/**
 * Create one match manually.
 */
export type CreateMatchBody = {
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  scheduledFor?: string;
};

/**
 * Bulk import matches.
 */
export type ImportMatchesBody = {
  mode: "replace" | "append";
  matches: Array<{
    week: number;
    homeTeamId: number;
    awayTeamId: number;
    scheduledFor?: string;
  }>;
};

export type ImportMatchesResponse = {
  created: number;
  replaced?: number;
};

export type GenerateSeasonMatchesResponse = {
  created: number;
  cleared: number;
};

export type MatchUpdateBody = {
  scheduledFor?: string;
  status?: MatchStatus;
};

