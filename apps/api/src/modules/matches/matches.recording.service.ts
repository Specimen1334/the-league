// apps/api/src/modules/matches/matches.recording.service.ts
import type { AppUser } from "../../shared/types";
import { matchesRepo } from "./matches.repo";
import { teamsRepo } from "../teams/teams.repo";
import type {
  FinalSheetsResponse,
  FinalSheetsTeam,
  FinalSheetsPokemon
} from "./matches.schemas";

/**
 * Recording / sheets helper.
 *
 * In the full design this would also aggregate per-game events, EV/IV
 * validations, etc. For now it:
 * - loads match + teams
 * - reads the final lineups
 * - expands them into open "final sheets" using roster info.
 *
 * Once you have a dedicated `match_sheets` table, you can extend the
 * mapping here and keep the rest of the API stable.
 */

export const matchesRecordingService = {
  getFinalSheets(matchId: number, user: AppUser): FinalSheetsResponse {
    const match = matchesRepo.getMatchById(matchId);
    if (!match) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // Only expose final sheets when the match is completed or voided.
    if (match.status !== "Completed" && match.status !== "Voided") {
      const err = new Error("Final sheets are only available after completion");
      (err as any).statusCode = 409;
      throw err;
    }

    const teamA = teamsRepo.getTeamById(match.teamAId);
    const teamB = teamsRepo.getTeamById(match.teamBId);

    if (!teamA || !teamB) {
      const err = new Error("Match teams not found");
      (err as any).statusCode = 500;
      throw err;
    }

    // In the absence of a dedicated sheets table, we use the current roster
    // as the "open sheet". This still gives the client something usable
    // and stable to build UI on, and can be upgraded later.
    const teamASheet = buildTeamSheet(teamA.id);
    const teamBSheet = buildTeamSheet(teamB.id);

    const teams: FinalSheetsTeam[] = [
      {
        teamId: teamA.id,
        name: teamA.name,
        logoUrl: teamA.logoUrl,
        sheet: teamASheet
      },
      {
        teamId: teamB.id,
        name: teamB.name,
        logoUrl: teamB.logoUrl,
        sheet: teamBSheet
      }
    ];

    return {
      matchId: match.id,
      seasonId: match.seasonId,
      teams
    };
  }
};

function buildTeamSheet(teamId: number): FinalSheetsPokemon[] {
  const roster = teamsRepo.listTeamRoster(teamId);

  // For now we only have roster-level info; the rest is placeholder
  // ready for future match_sheets data.
  return roster.map((r) => ({
    pokemonInstanceId: r.pokemonInstanceId,
    pokemonId: r.pokemonId,
    speciesName: r.speciesName,
    nickname: r.nickname,
    item: null,
    ability: null,
    nature: null,
    moves: [],
    evs: null
  }));
}
