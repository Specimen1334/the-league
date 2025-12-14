// apps/api/src/modules/teams/lineups.service.ts
import { dbFile } from "../../db/index";
import type { AppUser } from "../../shared/types";
import { teamsRepo } from "./teams.repo";
import type { SetLineupBody, SetLineupResponse } from "./lineups.schemas";

/**
 * Low-level DB helpers for the lineups table.
 * Conceptual model (from Backend Design):
 * Lineup: lineupId, teamId, round, selected pokemonInstanceIds, status, validation status.
 *
 * Actual table is expected to look roughly like:
 *
 *  CREATE TABLE lineups (
 *    id INTEGER PRIMARY KEY AUTOINCREMENT,
 *    team_id INTEGER NOT NULL,
 *    season_id INTEGER NOT NULL,
 *    round INTEGER NOT NULL,
 *    pokemon_ids_json TEXT NOT NULL,
 *    status TEXT NOT NULL,
 *    validation_json TEXT,
 *    created_at TEXT NOT NULL DEFAULT (datetime('now')),
 *    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 *    UNIQUE(team_id, round)
 *  );
 *
 * Schema creation is not enforced here – we assume it exists, per project approach.
 */

type LineupRow = {
  id: number;
  team_id: number;
  season_id: number;
  round: number;
  pokemon_ids_json: string;
  status: string;
  validation_json: string | null;
};

const insertOrUpdateLineupStmt = dbFile.prepare<
  [number, number, number, string, string, string]
>(`
  INSERT INTO lineups (team_id, season_id, round, pokemon_ids_json, status, validation_json)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(team_id, round) DO UPDATE SET
    pokemon_ids_json = excluded.pokemon_ids_json,
    status = excluded.status,
    validation_json = excluded.validation_json,
    season_id = excluded.season_id,
    updated_at = datetime('now')
  RETURNING id, team_id, season_id, round, pokemon_ids_json, status, validation_json
`);

export const lineupsService = {
  /**
   * Set or update the active lineup for a team in a given round.
   * Used by:
   * - POST /seasons/:seasonId/teams/:teamId/lineup
   */
  setActiveLineup(
    seasonId: number,
    teamId: number,
    user: AppUser,
    body: SetLineupBody
  ): SetLineupResponse {
    if (!Number.isInteger(body.round) || body.round <= 0) {
      const err = new Error("Round must be a positive integer");
      (err as any).statusCode = 400;
      throw err;
    }

    const rawIds = body.pokemonInstanceIds ?? [];
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      const err = new Error("pokemonInstanceIds must be a non-empty array");
      (err as any).statusCode = 400;
      throw err;
    }

    const uniqueIds = [...new Set(rawIds.map(Number))].filter(
      (id) => Number.isInteger(id) && id > 0
    );
    if (uniqueIds.length === 0) {
      const err = new Error("pokemonInstanceIds must contain valid numeric IDs");
      (err as any).statusCode = 400;
      throw err;
    }

    // Ensure team exists and is owned/managed by the current user.
    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found in this season");
      (err as any).statusCode = 404;
      throw err;
    }
    if (team.userId !== user.id) {
      // Later we can extend this to allow commissioners, co-managers, etc.
      const err = new Error("You are not the manager of this team");
      (err as any).statusCode = 403;
      throw err;
    }

    // Validate that every requested pokemonInstanceId belongs to this team.
    const roster = teamsRepo.listTeamRoster(team.id);
    const rosterIds = new Set(roster.map((p) => p.pokemonInstanceId));
    const invalid = uniqueIds.filter((id) => !rosterIds.has(id));
    const warnings: string[] = [];
    const errors: string[] = [];

    if (invalid.length > 0) {
      errors.push(
        `Some Pokémon are not on this team's roster: ${invalid.join(", ")}`
      );
    }

    const isValid = errors.length === 0;

    const validation = {
      isValid,
      warnings,
      errors
    };

    const row = insertOrUpdateLineupStmt.get(
      team.id,
      seasonId,
      body.round,
      JSON.stringify(uniqueIds),
      // For now, we mark as "Draft" – a scheduler or job can mark as Locked/Expired.
      "Draft",
      JSON.stringify(validation)
    ) as LineupRow;

    return {
      lineupId: row.id,
      teamId: row.team_id,
      seasonId: row.season_id,
      round: row.round,
      status: row.status as SetLineupResponse["status"],
      validation,
      pokemonInstanceIds: uniqueIds
    };
  }
};
