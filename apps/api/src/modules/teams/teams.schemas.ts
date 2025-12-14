// apps/api/src/modules/teams/teams.schemas.ts
import type { TeamRosterRow, TeamItemRow, TeamMatchRow } from "./teams.repo";

/**
 * Request body: join a season (create a team).
 * Maps to: POST /seasons/:seasonId/teams/join
 */
export type JoinSeasonTeamBody = {
  name: string;
  logoUrl?: string | null;
  bio?: string | null;
};

/**
 * Request body: transfer team manager.
 * Maps to: POST /seasons/:seasonId/teams/:teamId/transfer
 */
export type TransferTeamBody = {
  /** New manager's user ID. (User must already exist.) */
  newManagerUserId: number;
};

/**
 * Lightweight match summary from the perspective of this team.
 * Used in Team Hub overview and "Matches" tab.
 */
export type TeamMatchSummary = {
  matchId: number;
  round: number | null;
  scheduledAt: string | null;
  status: string;

  opponentTeamId: number;
  opponentTeamName: string | null;

  result:
    | "Pending"
    | "Win"
    | "Loss"
    | "Draw"
    | "Voided"
    | "UnderReview";

  scoreFor: number | null;
  scoreAgainst: number | null;
};

/**
 * Roster entry used in roster/overview.
 */
export type TeamRosterPokemon = {
  pokemonInstanceId: number;
  pokemonId: number;
  speciesName: string | null;
  nickname: string | null;
  isActive: boolean;
  /** true if currently on the bench but eligible */
  isBenched: boolean;
  /** false if banned, injured, etc. (depends on season rules later) */
  canPlay: boolean;
};

export type TeamInventoryItem = {
  itemId: number;
  name: string;
  category: string | null;
  quantity: number;
};

export type TeamRecord = {
  wins: number;
  losses: number;
  draws: number;
  points: number;
};

export type TeamHubOverviewResponse = {
  team: {
    id: number;
    seasonId: number;
    leagueId: number | null;
    name: string;
    logoUrl: string | null;
    bio: string | null;
    managerUserId: number;
    managerDisplayName: string | null;
  };
  record: TeamRecord;
  upcomingMatches: TeamMatchSummary[];
  recentMatches: TeamMatchSummary[];
  rosterPreview: TeamRosterPokemon[];
  notifications: {
    id: number;
    type: string;
    title: string;
    createdAt: string;
    isRead: boolean;
  }[];
};

export type TeamRosterResponse = {
  teamId: number;
  seasonId: number;
  pokemon: TeamRosterPokemon[];
};

export type TeamInventoryResponse = {
  teamId: number;
  seasonId: number;
  balance: number;
  items: TeamInventoryItem[];
};

export type TeamMatchesResponse = {
  teamId: number;
  seasonId: number;
  matches: TeamMatchSummary[];
};

/**
 * Helper mapping functions so services can transform repo rows
 * into the response view models cleanly.
 */

export function mapRosterRowToPokemon(
  row: TeamRosterRow
): TeamRosterPokemon {
  return {
    pokemonInstanceId: row.pokemonInstanceId,
    pokemonId: row.pokemonId,
    speciesName: row.speciesName,
    nickname: row.nickname,
    isActive: false,
    isBenched: true,
    canPlay: true
  };
}

export function mapItemRowToInventoryItem(
  row: TeamItemRow
): TeamInventoryItem {
  return {
    itemId: row.itemId,
    name: row.itemName,
    category: row.category,
    quantity: row.quantity
  };
}

export function mapMatchRowToSummary(
  row: TeamMatchRow,
  perspectiveTeamId: number,
  opponentTeamName: string | null
): TeamMatchSummary {
  const isTeamA = row.teamAId === perspectiveTeamId;
  const scoreFor = isTeamA ? row.scoreTeamA : row.scoreTeamB;
  const scoreAgainst = isTeamA ? row.scoreTeamB : row.scoreTeamA;

  let result: TeamMatchSummary["result"] = "Pending";

  if (row.status === "Voided") {
    result = "Voided";
  } else if (row.status === "UnderReview") {
    result = "UnderReview";
  } else if (row.status === "Completed" && row.winnerTeamId != null) {
    if (row.winnerTeamId === perspectiveTeamId) result = "Win";
    else result = "Loss";
  } else if (row.status === "Completed" && row.winnerTeamId == null) {
    result = "Draw";
  }

  return {
    matchId: row.id,
    round: row.round,
    scheduledAt: row.scheduledAt,
    status: row.status,
    opponentTeamId: isTeamA ? row.teamBId : row.teamAId,
    opponentTeamName,
    result,
    scoreFor,
    scoreAgainst
  };
}
