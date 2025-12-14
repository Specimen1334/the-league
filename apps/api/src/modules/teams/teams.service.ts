// apps/api/src/modules/teams/teams.service.ts
import type { AppUser } from "../../shared/types";
import { teamsRepo } from "./teams.repo";
import {
  mapItemRowToInventoryItem,
  mapMatchRowToSummary,
  mapRosterRowToPokemon,
  type JoinSeasonTeamBody,
  type TeamHubOverviewResponse,
  type TeamInventoryResponse,
  type TeamMatchesResponse,
  type TeamRosterResponse,
  type TransferTeamBody,
  type TeamRecord
} from "./teams.schemas";

/**
 * Team-related business logic. Used by routes/teams.ts and other modules
 * (e.g. dashboard, matches summaries) as needed.
 */

function computeRecord(
  matches: ReturnType<typeof teamsRepo.listTeamMatches>,
  teamId: number
): TeamRecord {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const m of matches) {
    if (m.status !== "Completed") continue;

    if (m.winnerTeamId == null) {
      draws++;
    } else if (m.winnerTeamId === teamId) {
      wins++;
    } else {
      losses++;
    }
  }

  // Very simple points system: 3 for win, 1 for draw.
  const points = wins * 3 + draws * 1;

  return { wins, losses, draws, points };
}

export const teamsService = {
  /**
   * Team Hub overview.
   * Maps to: GET /seasons/:seasonId/teams/:teamId
   */
  getTeamHubOverview(
    seasonId: number,
    teamId: number,
    user: AppUser
  ): TeamHubOverviewResponse {
    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const matches = teamsRepo.listTeamMatches(seasonId, team.id);
    const roster = teamsRepo.listTeamRoster(team.id);

    const record = computeRecord(matches, team.id);

    // Simple upcoming / recent derivation.
    const completed = matches.filter((m) => m.status === "Completed");
    const upcoming = matches.filter(
      (m) => m.status === "Scheduled" || m.status === "AwaitingResult"
    );

    const recentMatches = completed.slice(-5).map((m) =>
      mapMatchRowToSummary(
        m,
        team.id,
        null // opponent name resolution can be added later via extra repo lookups
      )
    );

    const upcomingMatches = upcoming.slice(0, 5).map((m) =>
      mapMatchRowToSummary(
        m,
        team.id,
        null
      )
    );

    const rosterPreview = roster
      .slice(0, 6)
      .map((row) => mapRosterRowToPokemon(row));

    // Placeholder notifications (hooked into inbox later).
    const notifications: TeamHubOverviewResponse["notifications"] = [];

    return {
      team: {
        id: team.id,
        seasonId: team.seasonId,
        leagueId: null, // can be filled once league-season join is wired
        name: team.name,
        logoUrl: team.logoUrl,
        bio: team.bio,
        managerUserId: team.userId,
        managerDisplayName: null // can be filled later from users table
      },
      record,
      upcomingMatches,
      recentMatches,
      rosterPreview,
      notifications
    };
  },

  /**
   * Full roster for the Team Hub "Roster" tab.
   * Maps to: GET /seasons/:seasonId/teams/:teamId/roster
   */
  getTeamRoster(
    seasonId: number,
    teamId: number,
    user: AppUser
  ): TeamRosterResponse {
    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const rosterRows = teamsRepo.listTeamRoster(team.id);
    const pokemon = rosterRows.map((row) => mapRosterRowToPokemon(row));

    return {
      teamId: team.id,
      seasonId: team.seasonId,
      pokemon
    };
  },

  /**
   * Items + currency for Team Hub "Inventory" tab.
   * Maps to: GET /seasons/:seasonId/teams/:teamId/inventory
   */
  getTeamInventory(
    seasonId: number,
    teamId: number,
    user: AppUser
  ): TeamInventoryResponse {
    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const itemRows = teamsRepo.listTeamInventory(team.id);
    const items = itemRows.map((row) => mapItemRowToInventoryItem(row));

    // Balance can later be fetched from a dedicated economy table.
    const balance = 0;

    return {
      teamId: team.id,
      seasonId: team.seasonId,
      balance,
      items
    };
  },

  /**
   * Team-centric match list for the "Matches" tab.
   * Maps to: GET /seasons/:seasonId/teams/:teamId/matches
   */
  getTeamMatches(
    seasonId: number,
    teamId: number,
    user: AppUser
  ): TeamMatchesResponse {
    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const matchRows = teamsRepo.listTeamMatches(seasonId, team.id);

    const matches = matchRows.map((row) =>
      mapMatchRowToSummary(
        row,
        team.id,
        null // opponent name can be wired later
      )
    );

    return {
      teamId: team.id,
      seasonId: team.seasonId,
      matches
    };
  },

  /**
   * Join a season by creating a new team for the user.
   * Maps to: POST /seasons/:seasonId/teams/join
   */
  joinSeasonAndCreateTeam(
    seasonId: number,
    user: AppUser,
    body: JoinSeasonTeamBody
  ): TeamHubOverviewResponse {
    const name = (body.name ?? "").trim();
    if (name.length < 2) {
      const err = new Error("Team name must be at least 2 characters");
      (err as any).statusCode = 400;
      throw err;
    }

    // Prevent multiple teams per user in the same season.
    const existing = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (existing) {
      const err = new Error("You already have a team in this season");
      (err as any).statusCode = 409;
      throw err;
    }

    const team = teamsRepo.createTeamForSeason(
      seasonId,
      user.id,
      name,
      body.logoUrl ?? null,
      body.bio ?? null
    );

    // Return the same structure as the Team Hub overview endpoint.
    return this.getTeamHubOverview(seasonId, team.id, user);
  },

  /**
   * Transfer team management to another user.
   * Maps to: POST /seasons/:seasonId/teams/:teamId/transfer
   */
  transferTeam(
    seasonId: number,
    teamId: number,
    user: AppUser,
    body: TransferTeamBody
  ): TeamHubOverviewResponse {
    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (!Number.isInteger(body.newManagerUserId) || body.newManagerUserId <= 0) {
      const err = new Error("newManagerUserId must be a positive integer");
      (err as any).statusCode = 400;
      throw err;
    }

    // Basic permission: only current manager can transfer.
    // (Later we can allow commissioners as well.)
    if (team.userId !== user.id) {
      const err = new Error("Only the current manager can transfer this team");
      (err as any).statusCode = 403;
      throw err;
    }

    if (body.newManagerUserId === user.id) {
      const err = new Error("Cannot transfer team to the same manager");
      (err as any).statusCode = 400;
      throw err;
    }

    const updated = teamsRepo.transferTeamOwnership(
      team.id,
      body.newManagerUserId
    );
    if (!updated) {
      const err = new Error("Failed to transfer team");
      (err as any).statusCode = 500;
      throw err;
    }

    return this.getTeamHubOverview(seasonId, updated.id, user);
  }
};
