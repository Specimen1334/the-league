// apps/api/src/modules/teams/teams.repo.ts
import { dbFile } from "../../db/index";

/**
 * Core Team model (conceptual from Backend Design):
 *
 * Team:
 *  id, seasonId, userId, name, logoUrl, bio, createdAt.
 */

export type TeamRow = {
  id: number;
  seasonId: number;
  userId: number;
  name: string;
  logoUrl: string | null;
  bio: string | null;
  createdAt: string;
};

export type TeamRosterRow = {
  teamId: number;
  pokemonInstanceId: number;
  pokemonId: number;
  speciesName: string | null;
  nickname: string | null;
};

export type TeamItemRow = {
  teamId: number;
  itemId: number;
  itemName: string;
  category: string | null;
  quantity: number;
};

export type TeamMatchRow = {
  id: number;
  seasonId: number;
  round: number | null;
  teamAId: number;
  teamBId: number;
  scheduledAt: string | null;
  status: string;
  winnerTeamId: number | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
};

export type CreateMatchParams = {
  seasonId: number;
  round: number | null;
  scheduledAt: string | null;
  teamAId: number;
  teamBId: number;
  status?: string; // default Scheduled
};

const selectTeamBase = `
  SELECT
    id,
    season_id  AS seasonId,
    user_id    AS userId,
    name,
    logo_url   AS logoUrl,
    bio,
    created_at AS createdAt
  FROM teams
`;

const getTeamByIdStmt = dbFile.prepare<[number]>(`
  ${selectTeamBase}
  WHERE id = ?
`);

const getTeamBySeasonAndIdStmt = dbFile.prepare<[number, number]>(`
  ${selectTeamBase}
  WHERE season_id = ? AND id = ?
`);

const getTeamBySeasonAndUserStmt = dbFile.prepare<[number, number]>(`
  ${selectTeamBase}
  WHERE season_id = ? AND user_id = ?
`);

const listSeasonTeamsStmt = dbFile.prepare<[number]>(`
  ${selectTeamBase}
  WHERE season_id = ?
  ORDER BY created_at ASC
`);

const insertTeamStmt = dbFile.prepare<
  [number, number, string, string | null, string | null]
>(`
  INSERT INTO teams (season_id, user_id, name, logo_url, bio)
  VALUES (?, ?, ?, ?, ?)
  RETURNING
    id,
    season_id  AS seasonId,
    user_id    AS userId,
    name,
    logo_url   AS logoUrl,
    bio,
    created_at AS createdAt
`);

const transferTeamStmt = dbFile.prepare<[number, number]>(`
  UPDATE teams
  SET user_id = ?
  WHERE id = ?
  RETURNING
    id,
    season_id  AS seasonId,
    user_id    AS userId,
    name,
    logo_url   AS logoUrl,
    bio,
    created_at AS createdAt
`);

const listRosterStmt = dbFile.prepare<[number]>(`
  SELECT
    r.team_id              AS teamId,
    r.pokemon_instance_id  AS pokemonInstanceId,
    r.pokemon_id           AS pokemonId,
    r.species_name         AS speciesName,
    r.nickname             AS nickname
  FROM team_roster r
  WHERE r.team_id = ?
  ORDER BY r.pokemon_instance_id ASC
`);

const listInventoryStmt = dbFile.prepare<[number]>(`
  SELECT
    ti.team_id   AS teamId,
    ti.item_id   AS itemId,
    i.name       AS itemName,
    i.category   AS category,
    ti.quantity  AS quantity
  FROM team_items ti
  JOIN items i ON i.id = ti.item_id
  WHERE ti.team_id = ?
  ORDER BY i.name ASC
`);

const listTeamMatchesStmt = dbFile.prepare<[number, number]>(`
  SELECT
    id,
    season_id     AS seasonId,
    round,
    team_a_id     AS teamAId,
    team_b_id     AS teamBId,
    scheduled_at  AS scheduledAt,
    status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB
  FROM matches
  WHERE season_id = ?
    AND (team_a_id = ? OR team_b_id = ?)
  ORDER BY
    round IS NULL,
    round ASC,
    scheduled_at ASC
`);

const deleteSeasonMatchesStmt = dbFile.prepare<[number]>(`
  DELETE FROM matches
  WHERE season_id = ?
`);

const insertMatchStmt = dbFile.prepare<
  [number, number | null, number, number, string | null, string]
>(`
  INSERT INTO matches (
    season_id,
    round,
    team_a_id,
    team_b_id,
    scheduled_at,
    status
  )
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    season_id     AS seasonId,
    round,
    team_a_id     AS teamAId,
    team_b_id     AS teamBId,
    scheduled_at  AS scheduledAt,
    status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB
`);

export const teamsRepo = {
  getTeamById(id: number): TeamRow | undefined {
    return getTeamByIdStmt.get(id) as TeamRow | undefined;
  },

  getTeamBySeasonAndId(seasonId: number, teamId: number): TeamRow | undefined {
    return getTeamBySeasonAndIdStmt.get(seasonId, teamId) as
      | TeamRow
      | undefined;
  },

  getTeamBySeasonAndUser(
    seasonId: number,
    userId: number
  ): TeamRow | undefined {
    return getTeamBySeasonAndUserStmt.get(seasonId, userId) as
      | TeamRow
      | undefined;
  },

  listSeasonTeams(seasonId: number): TeamRow[] {
    return listSeasonTeamsStmt.all(seasonId) as TeamRow[];
  },

  createTeamForSeason(
    seasonId: number,
    userId: number,
    name: string,
    logoUrl: string | null,
    bio: string | null
  ): TeamRow {
    return insertTeamStmt.get(
      seasonId,
      userId,
      name,
      logoUrl,
      bio
    ) as TeamRow;
  },

  transferTeamOwnership(teamId: number, newUserId: number): TeamRow | undefined {
    return transferTeamStmt.get(newUserId, teamId) as TeamRow | undefined;
  },

  listTeamRoster(teamId: number): TeamRosterRow[] {
    return listRosterStmt.all(teamId) as TeamRosterRow[];
  },

  listTeamInventory(teamId: number): TeamItemRow[] {
    return listInventoryStmt.all(teamId) as TeamItemRow[];
  },

  listTeamMatches(seasonId: number, teamId: number): TeamMatchRow[] {
    return listTeamMatchesStmt.all(seasonId, teamId, teamId) as TeamMatchRow[];
  },

  /**
   * Used by schedule generation to rebuild the fixture.
   */
  deleteSeasonMatches(seasonId: number): void {
    deleteSeasonMatchesStmt.run(seasonId);
  },

  /**
   * Used by schedule generation (and later manual match creation tools).
   */
  createMatch(params: CreateMatchParams): TeamMatchRow {
    const status = params.status ?? "Scheduled";
    return insertMatchStmt.get(
      params.seasonId,
      params.round ?? null,
      params.teamAId,
      params.teamBId,
      params.scheduledAt ?? null,
      status
    ) as TeamMatchRow;
  }
};
