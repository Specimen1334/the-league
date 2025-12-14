// apps/api/src/modules/matches/matches.repo.ts
import { dbFile } from "../../db/index";
import type { MatchStatus, AdminUpdateMatchBody } from "./matches.schemas";

/**
 * Core match row as stored in DB.
 *
 * Expected table (for reference):
 *
 * CREATE TABLE matches (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   season_id INTEGER NOT NULL,
 *   league_id INTEGER,
 *   round INTEGER,
 *   team_a_id INTEGER NOT NULL,
 *   team_b_id INTEGER NOT NULL,
 *   scheduled_at TEXT,
 *   status TEXT NOT NULL,
 *   winner_team_id INTEGER,
 *   score_team_a INTEGER,
 *   score_team_b INTEGER,
 *   created_at TEXT NOT NULL DEFAULT (datetime('now')),
 *   updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 * );
 */
export type MatchRow = {
  id: number;
  seasonId: number;
  leagueId: number | null;
  round: number | null;
  teamAId: number;
  teamBId: number;
  scheduledAt: string | null;
  status: MatchStatus;
  winnerTeamId: number | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  createdAt: string;
};

export type MatchResultRow = {
  id: number;
  matchId: number;
  submittedByTeamId: number;
  submittedByUserId: number;
  status: "Pending" | "Approved" | "Rejected";
  scoreTeamA: number;
  scoreTeamB: number;
  winnerTeamId: number | null;
  notes: string | null;
  game_breakdown_json: string | null;
  createdAt: string;
};

export type MatchResultVoteRow = {
  id: number;
  resultId: number;
  userId: number;
  vote: "up" | "down";
  comment: string | null;
  createdAt: string;
};

/**
 * Lineup row for a team/round.
 * From the lineups table used by Team Hub.
 */
export type LineupRow = {
  id: number;
  teamId: number;
  seasonId: number;
  round: number;
  pokemonIds: number[];
  status: "Draft" | "Locked" | "Expired";
};

const selectMatchBase = `
  SELECT
    id,
    season_id      AS seasonId,
    league_id      AS leagueId,
    round,
    team_a_id      AS teamAId,
    team_b_id      AS teamBId,
    scheduled_at   AS scheduledAt,
    status         AS status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB,
    created_at     AS createdAt
  FROM matches
`;

const getMatchByIdStmt = dbFile.prepare<[number]>(`
  ${selectMatchBase}
  WHERE id = ?
`);

const listMatchResultsStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    match_id              AS matchId,
    submitted_by_team_id  AS submittedByTeamId,
    submitted_by_user_id  AS submittedByUserId,
    status,
    score_team_a          AS scoreTeamA,
    score_team_b          AS scoreTeamB,
    winner_team_id        AS winnerTeamId,
    notes,
    game_breakdown_json,
    created_at            AS createdAt
  FROM match_results
  WHERE match_id = ?
  ORDER BY created_at ASC
`);

const insertMatchResultStmt = dbFile.prepare<
  [
    number,
    number,
    number,
    number,
    number,
    number | null,
    string | null,
    string | null
  ]
>(`
  INSERT INTO match_results (
    match_id,
    submitted_by_team_id,
    submitted_by_user_id,
    score_team_a,
    score_team_b,
    winner_team_id,
    notes,
    game_breakdown_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    match_id              AS matchId,
    submitted_by_team_id  AS submittedByTeamId,
    submitted_by_user_id  AS submittedByUserId,
    status,
    score_team_a          AS scoreTeamA,
    score_team_b          AS scoreTeamB,
    winner_team_id        AS winnerTeamId,
    notes,
    game_breakdown_json,
    created_at            AS createdAt
`);

const getResultByIdStmt = dbFile.prepare<[number, number]>(`
  SELECT
    id,
    match_id              AS matchId,
    submitted_by_team_id  AS submittedByTeamId,
    submitted_by_user_id  AS submittedByUserId,
    status,
    score_team_a          AS scoreTeamA,
    score_team_b          AS scoreTeamB,
    winner_team_id        AS winnerTeamId,
    notes,
    game_breakdown_json,
    created_at            AS createdAt
  FROM match_results
  WHERE match_id = ? AND id = ?
`);

const insertResultVoteStmt = dbFile.prepare<
  [number, number, "up" | "down", string | null]
>(`
  INSERT INTO match_result_votes (
    result_id,
    user_id,
    vote,
    comment
  )
  VALUES (?, ?, ?, ?)
  RETURNING id
`);

const listResultVotesStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    result_id AS resultId,
    user_id   AS userId,
    vote,
    comment,
    created_at AS createdAt
  FROM match_result_votes
  WHERE result_id = ?
`);

const getUserVoteForResultStmt = dbFile.prepare<[number, number]>(`
  SELECT
    id,
    result_id AS resultId,
    user_id   AS userId,
    vote,
    comment,
    created_at AS createdAt
  FROM match_result_votes
  WHERE result_id = ? AND user_id = ?
  ORDER BY created_at DESC
  LIMIT 1
`);

const resetMatchStmt = dbFile.prepare<[number]>(`
  UPDATE matches
  SET
    status = 'Scheduled',
    winner_team_id = NULL,
    score_team_a = NULL,
    score_team_b = NULL,
    updated_at = datetime('now')
  WHERE id = ?
`);

const overrideMatchResultStmt = dbFile.prepare<
  [number | null, number | null, number | null, number]
>(`
  UPDATE matches
  SET
    winner_team_id = ?,
    score_team_a = ?,
    score_team_b = ?,
    status = 'Completed',
    updated_at = datetime('now')
  WHERE id = ?
  RETURNING
    id,
    season_id      AS seasonId,
    league_id      AS leagueId,
    round,
    team_a_id      AS teamAId,
    team_b_id      AS teamBId,
    scheduled_at   AS scheduledAt,
    status         AS status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB,
    created_at     AS createdAt
`);

const updateMatchAdminStmtBase = `
  UPDATE matches
  SET
`;

const getLineupsForMatchStmt = dbFile.prepare<[number, number, number]>(`
  SELECT
    id,
    team_id         AS teamId,
    season_id       AS seasonId,
    round,
    pokemon_ids_json,
    status
  FROM lineups
  WHERE season_id = ?
    AND round = ?
    AND team_id IN (?, ?)
`);


const listSeasonMatchesStmt = dbFile.prepare<
  [number, number | null, number | null, MatchStatus | null]
>(`
  SELECT
    id,
    season_id      AS seasonId,
    league_id      AS leagueId,
    round,
    team_a_id      AS teamAId,
    team_b_id      AS teamBId,
    scheduled_at   AS scheduledAt,
    status         AS status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB,
    created_at     AS createdAt,
    updated_at     AS updatedAt
  FROM matches
  WHERE season_id = ?
    AND (? IS NULL OR round = ?)
    AND (? IS NULL OR status = ?)
  ORDER BY
    round IS NULL,
    round ASC,
    scheduled_at ASC,
    id ASC
`);

const insertSeasonMatchStmt = dbFile.prepare<
  [number, number, number | null, number | null, number | null, string | null, MatchStatus]
>(`
  INSERT INTO matches (
    league_id,
    season_id,
    round,
    team_a_id,
    team_b_id,
    scheduled_at,
    status
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    season_id      AS seasonId,
    league_id      AS leagueId,
    round,
    team_a_id      AS teamAId,
    team_b_id      AS teamBId,
    scheduled_at   AS scheduledAt,
    status         AS status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB,
    created_at     AS createdAt,
    updated_at     AS updatedAt
`);

const updateSeasonMatchStmt = dbFile.prepare<
  [string | null, MatchStatus | null, number]
>(`
  UPDATE matches
  SET
    scheduled_at = COALESCE(?, scheduled_at),
    status = COALESCE(?, status),
    updated_at = datetime('now')
  WHERE id = ?
  RETURNING
    id,
    season_id      AS seasonId,
    league_id      AS leagueId,
    round,
    team_a_id      AS teamAId,
    team_b_id      AS teamBId,
    scheduled_at   AS scheduledAt,
    status         AS status,
    winner_team_id AS winnerTeamId,
    score_team_a   AS scoreTeamA,
    score_team_b   AS scoreTeamB,
    created_at     AS createdAt,
    updated_at     AS updatedAt
`);

const deleteSeasonMatchesAllStmt = dbFile.prepare<[number]>(`
  DELETE FROM matches
  WHERE season_id = ?
`);


export const matchesRepo = {
  getMatchById(matchId: number): MatchRow | undefined {
    return getMatchByIdStmt.get(matchId) as MatchRow | undefined;
  },

  listMatchResults(matchId: number): MatchResultRow[] {
    return listMatchResultsStmt.all(matchId) as MatchResultRow[];
  },

  createMatchResult(params: {
    matchId: number;
    submittedByTeamId: number;
    submittedByUserId: number;
    scoreTeamA: number;
    scoreTeamB: number;
    winnerTeamId: number | null;
    notes: string | null;
    gameBreakdownJson: string | null;
  }): MatchResultRow {
    const row = insertMatchResultStmt.get(
      params.matchId,
      params.submittedByTeamId,
      params.submittedByUserId,
      params.scoreTeamA,
      params.scoreTeamB,
      params.winnerTeamId,
      params.notes,
      params.gameBreakdownJson
    ) as MatchResultRow;
    return row;
  },

  getResultById(matchId: number, resultId: number): MatchResultRow | undefined {
    return getResultByIdStmt.get(matchId, resultId) as
      | MatchResultRow
      | undefined;
  },

  addResultVote(params: {
    resultId: number;
    userId: number;
    vote: "up" | "down";
    comment?: string;
  }) {
    insertResultVoteStmt.get(
      params.resultId,
      params.userId,
      params.vote,
      params.comment ?? null
    );
  },

  listResultVotes(resultId: number): MatchResultVoteRow[] {
    return listResultVotesStmt.all(resultId) as MatchResultVoteRow[];
  },

  getUserVoteForResult(
    resultId: number,
    userId: number
  ): MatchResultVoteRow | undefined {
    return getUserVoteForResultStmt.get(resultId, userId) as
      | MatchResultVoteRow
      | undefined;
  },

  resetMatch(matchId: number): void {
    resetMatchStmt.run(matchId);
  },

  overrideMatchResult(
    matchId: number,
    winnerTeamId: number | null,
    scoreTeamA: number | null,
    scoreTeamB: number | null
  ): MatchRow | undefined {
    return overrideMatchResultStmt.get(
      winnerTeamId,
      scoreTeamA,
      scoreTeamB,
      matchId
    ) as MatchRow | undefined;
  },

  /**
   * Patch-style update for commissioner admin.
   */
  updateMatchAdmin(
    matchId: number,
    body: AdminUpdateMatchBody
  ): MatchRow | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (body.scheduledAt !== undefined) {
      fields.push("scheduled_at = ?");
      values.push(body.scheduledAt);
    }
    if (body.status !== undefined) {
      fields.push("status = ?");
      values.push(body.status);
    }
    if (body.teamAId !== undefined) {
      fields.push("team_a_id = ?");
      values.push(body.teamAId);
    }
    if (body.teamBId !== undefined) {
      fields.push("team_b_id = ?");
      values.push(body.teamBId);
    }
    if (body.round !== undefined) {
      fields.push("round = ?");
      values.push(body.round);
    }
    if (body.winnerTeamId !== undefined) {
      fields.push("winner_team_id = ?");
      values.push(body.winnerTeamId);
    }
    if (body.scoreTeamA !== undefined) {
      fields.push("score_team_a = ?");
      values.push(body.scoreTeamA);
    }
    if (body.scoreTeamB !== undefined) {
      fields.push("score_team_b = ?");
      values.push(body.scoreTeamB);
    }

    if (fields.length === 0) {
      return this.getMatchById(matchId);
    }

    fields.push("updated_at = datetime('now')");

    const sql = `
      ${updateMatchAdminStmtBase}
      ${fields.join(", ")}
      WHERE id = ?
      RETURNING
        id,
        season_id      AS seasonId,
        league_id      AS leagueId,
        round,
        team_a_id      AS teamAId,
        team_b_id      AS teamBId,
        scheduled_at   AS scheduledAt,
        status         AS status,
        winner_team_id AS winnerTeamId,
        score_team_a   AS scoreTeamA,
        score_team_b   AS scoreTeamB,
        created_at     AS createdAt
    `;

    const stmt = dbFile.prepare(sql);
    const row = stmt.get(...values, matchId) as MatchRow | undefined;
    return row;
  },

  /**
   * Returns lineups for both teams based on seasonId + round + team IDs.
   * Uses the shared `lineups` table written by the teams/lineups module.
   */
  getLineupsForMatch(
    seasonId: number,
    round: number,
    teamAId: number,
    teamBId: number
  ): LineupRow[] {
    const rows = getLineupsForMatchStmt.all(
      seasonId,
      round,
      teamAId,
      teamBId
    ) as {
      id: number;
      teamId: number;
      seasonId: number;
      round: number;
      pokemon_ids_json: string;
      status: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      seasonId: r.seasonId,
      round: r.round,
      pokemonIds: safeParseNumberArray(r.pokemon_ids_json),
      status: r.status as LineupRow["status"]
    }));
  },

  // ----- Season scheduling / contract spine -----

  listSeasonMatches(
    seasonId: number,
    query?: { round?: number; status?: MatchStatus }
  ) {
    const round = query?.round ?? null;
    const status = (query?.status ?? null) as MatchStatus | null;
    return listSeasonMatchesStmt.all(
      seasonId,
      round,
      round,
      status,
      status
    ) as any[];
  },

  createSeasonMatch(params: {
    leagueId: number;
    seasonId: number;
    round: number | null;
    teamAId: number | null;
    teamBId: number | null;
    scheduledAt: string | null;
    status: MatchStatus;
  }) {
    return insertSeasonMatchStmt.get(
      params.leagueId,
      params.seasonId,
      params.round,
      params.teamAId,
      params.teamBId,
      params.scheduledAt,
      params.status
    ) as any;
  },

  updateSeasonMatch(params: {
    matchId: number;
    scheduledAt?: string | null;
    status?: MatchStatus | null;
  }) {
    return updateSeasonMatchStmt.get(
      params.scheduledAt ?? null,
      (params.status ?? null) as MatchStatus | null,
      params.matchId
    ) as any;
  },

  deleteAllSeasonMatches(seasonId: number) {
    deleteSeasonMatchesAllStmt.run(seasonId);
  }

};

function safeParseNumberArray(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}
