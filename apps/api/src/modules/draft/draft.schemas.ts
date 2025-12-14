// apps/api/src/modules/draft/draft.schemas.ts

/**
 * Draft lifecycle status for a season.
 */
export type DraftStatus =
  | "NotStarted"
  | "Lobby"
  | "InProgress"
  | "Paused"
  | "Completed";

/**
 * Draft format.
 */
export type DraftType = "Snake" | "Linear" | "Custom";

export type DraftExportFormat = "csv" | "showdown";

/**
 * A participant in the draft lobby.
 */
export type DraftLobbyParticipant = {
  teamId: number;
  teamName: string;
  managerUserId: number;
  managerDisplayName: string | null;
  position: number;
  isReady: boolean;
  isYou: boolean;
};

/**
 * Lobby overview:
 * GET /seasons/:seasonId/draft/lobby
 */
export type DraftLobbyResponse = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;
  startsAt: string | null;
  pickTimerSeconds: number | null;
  roundCount: number | null;
  participants: DraftLobbyParticipant[];
};

export type DraftReadyResponse = DraftLobbyResponse;

/**
 * Live draft pick state.
 * GET /seasons/:seasonId/draft/state
 */
export type DraftStateResponse = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;

  currentRound: number; // 1-based
  currentPickInRound: number; // 1-based
  overallPickNumber: number; // 1-based (next pick)
  totalTeams: number;

  teamOnTheClock: {
    teamId: number;
    teamName: string;
  } | null;

  timer: {
    pickTimerSeconds: number | null;
  };

  picks: {
    id: number;
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    teamId: number;
    teamName: string | null;
    pokemonId: number;
  }[];
};

/**
 * Query params for GET /seasons/:seasonId/draft/pool
 */
export type DraftPoolQuery = {
  search?: string;
  type?: string;
  role?: string;
  onlyAvailable?: boolean;
  page?: number;
  limit?: number;
};

/**
 * Pool entry for draft.
 */
export type DraftPoolItem = {
  pokemonId: number;
  name: string;
  types: string[];
  roles: string[];
  baseCost: number | null;
  isPicked: boolean;
  pickedByTeamId: number | null;
};

/**
 * Response for GET /seasons/:seasonId/draft/pool
 */
export type DraftPoolResponse = {
  seasonId: number;
  items: DraftPoolItem[];
  page: number;
  limit: number;
  total: number;
};

/**
 * Body for POST /seasons/:seasonId/draft/pick
 */
export type DraftPickBody = {
  pokemonId: number;
};

/**
 * GET /seasons/:seasonId/draft/my
 */
export type MyDraftResponse = {
  seasonId: number;
  teamId: number;
  teamName: string;
  picks: {
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    pokemonId: number;
  }[];
  watchlistPokemonIds: number[];
};

/**
 * POST /seasons/:seasonId/draft/watchlist
 */
export type DraftWatchlistBody = {
  pokemonIds: number[];
};

export type DraftWatchlistResponse = {
  seasonId: number;
  teamId: number;
  pokemonIds: number[];
};

/**
 * Per-team draft result.
 */
export type DraftResultsTeam = {
  teamId: number;
  teamName: string;
  position: number;
  picks: {
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    pokemonId: number;
  }[];
};

export type DraftResultsResponse = {
  seasonId: number;
  type: DraftType;
  status: DraftStatus;
  teams: DraftResultsTeam[];
};

export type DraftTeamResultsResponse = {
  seasonId: number;
  team: DraftResultsTeam;
};

/**
 * POST /seasons/:seasonId/draft/admin/force-pick
 */
export type AdminForcePickBody = {
  pokemonId: number;
  teamId?: number;
};
