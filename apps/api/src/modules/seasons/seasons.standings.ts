// apps/api/src/modules/seasons/seasons.standings.ts
import type { AppUser } from "../../shared/types";
import { seasonsRepo } from "./seasons.repo";
import { teamsRepo } from "../teams/teams.repo";
import type {
  SeasonStandingsQuery,
  SeasonStandingsResponse,
  SeasonStandingsRow
} from "./seasons.schemas";

function computeRecordForTeam(
  seasonId: number,
  teamId: number
): { wins: number; losses: number; draws: number; points: number } {
  const matches = teamsRepo.listTeamMatches(seasonId, teamId);

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

  const points = wins * 3 + draws * 1;
  return { wins, losses, draws, points };
}

export const seasonStandingsService = {
  /**
   * GET /seasons/:seasonId/standings
   */
  getSeasonStandings(
    seasonId: number,
    _user: AppUser,
    query: SeasonStandingsQuery
  ): SeasonStandingsResponse {
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const sortBy: SeasonStandingsResponse["sortBy"] = query.sortBy ?? "points";
    const teams = teamsRepo.listSeasonTeams(season.id);

    const rows: SeasonStandingsRow[] = teams.map((team) => {
      const { wins, losses, draws, points } = computeRecordForTeam(
        season.id,
        team.id
      );

      return {
        rank: 0, // filled after sorting
        teamId: team.id,
        name: team.name,
        logoUrl: team.logoUrl,
        wins,
        losses,
        draws,
        points
      };
    });

    // Sort according to sortBy, then apply rank.
    rows.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }

      if (sortBy === "wins") {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.points !== a.points) return b.points - a.points;
        return a.name.localeCompare(b.name);
      }

      // Default: points, tie-break with wins then name.
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.name.localeCompare(b.name);
    });

    rows.forEach((row, idx) => {
      row.rank = idx + 1;
    });

    return {
      seasonId: season.id,
      sortBy,
      rows
    };
  }
};
