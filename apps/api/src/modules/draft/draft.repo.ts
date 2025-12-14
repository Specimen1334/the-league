// apps/api/src/modules/draft/draft.repo.ts
import { dbFile } from "../../db/index";
import type { DraftStatus, DraftType } from "./draft.schemas";

/**
 * Expected DB schema (for reference, not enforced here):
 *
 * draft_sessions
 *  - season_id INTEGER PRIMARY KEY
 *  - status TEXT NOT NULL            -- DraftStatus
 *  - type TEXT NOT NULL              -- DraftType
 *  - starts_at TEXT                  -- scheduled start, optional
 *  - pick_timer_seconds INTEGER
 *  - round_count INTEGER
 *  - config_json TEXT
 *  - created_at TEXT NOT NULL DEFAULT (datetime('now'))
 *
 * draft_participants
 *  - season_id INTEGER NOT NULL
 *  - team_id INTEGER NOT NULL
 *  - position INTEGER NOT NULL       -- 1-based draft order
 *  - is_ready INTEGER NOT NULL DEFAULT 0
 *  - joined_at TEXT NOT NULL DEFAULT (datetime('now'))
 *  - PRIMARY KEY (season_id, team_id)
 *
 * draft_picks
 *  - id INTEGER PRIMARY KEY AUTOINCREMENT
 *  - season_id INTEGER NOT NULL
 *  - round INTEGER NOT NULL
 *  - pick_in_round INTEGER NOT NULL
 *  - overall_pick_number INTEGER NOT NULL
 *  - team_id INTEGER NOT NULL
 *  - pokemon_id INTEGER NOT NULL
 *  - created_at TEXT NOT NULL DEFAULT (datetime('now'))
 */

export type DraftSessionRow = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;
  startsAt: string | null;
  pickTimerSeconds: number | null;
  roundCount: number | null;
  configJson: string | null;
};

export type DraftParticipantRow = {
  seasonId: number;
  teamId: number;
  position: number;
  isReady: boolean;
};

export type DraftPickRow = {
  id: number;
  seasonId: number;
  round: number;
  pickInRound: number;
  overallPickNumber: number;
  teamId: number;
  pokemonId: number;
  createdAt: string;
};

const getSessionStmt = dbFile.prepare<[number]>(`
  SELECT
    season_id         AS seasonId,
    status            AS status,
    type              AS type,
    starts_at         AS startsAt,
    pick_timer_seconds AS pickTimerSeconds,
    round_count       AS roundCount,
    config_json       AS configJson
  FROM draft_sessions
  WHERE season_id = ?
`);

const insertDefaultSessionStmt = dbFile.prepare<[number]>(`
  INSERT INTO draft_sessions (
    season_id,
    status,
    type,
    starts_at,
    pick_timer_seconds,
    round_count,
    config_json
  )
  VALUES (?, 'NotStarted', 'Snake', NULL, 60, NULL, NULL)
  RETURNING
    season_id         AS seasonId,
    status            AS status,
    type              AS type,
    starts_at         AS startsAt,
    pick_timer_seconds AS pickTimerSeconds,
    round_count       AS roundCount,
    config_json       AS configJson
`);

const updateSessionBaseSql = `
  UPDATE draft_sessions
  SET
`;

const listParticipantsStmt = dbFile.prepare<[number]>(`
  SELECT
    season_id AS seasonId,
    team_id   AS teamId,
    position,
    is_ready  AS isReady
  FROM draft_participants
  WHERE season_id = ?
  ORDER BY position ASC
`);

const insertParticipantStmt = dbFile.prepare<
  [number, number, number, number]
>(`
  INSERT INTO draft_participants (
    season_id,
    team_id,
    position,
    is_ready
  )
  VALUES (?, ?, ?, ?)
`);

const updateParticipantReadyStmt = dbFile.prepare<
  [number, number, number]
>(`
  UPDATE draft_participants
  SET is_ready = ?
  WHERE season_id = ? AND team_id = ?
`);

const listPicksStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    season_id          AS seasonId,
    round,
    pick_in_round      AS pickInRound,
    overall_pick_number AS overallPickNumber,
    team_id            AS teamId,
    pokemon_id         AS pokemonId,
    created_at         AS createdAt
  FROM draft_picks
  WHERE season_id = ?
  ORDER BY overall_pick_number ASC, id ASC
`);

const insertPickStmt = dbFile.prepare<
  [number, number, number, number, number]
>(`
  INSERT INTO draft_picks (
    season_id,
    round,
    pick_in_round,
    overall_pick_number,
    team_id,
    pokemon_id
  )
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    season_id          AS seasonId,
    round,
    pick_in_round      AS pickInRound,
    overall_pick_number AS overallPickNumber,
    team_id            AS teamId,
    pokemon_id         AS pokemonId,
    created_at         AS createdAt
`);

const getLastPickStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    season_id          AS seasonId,
    round,
    pick_in_round      AS pickInRound,
    overall_pick_number AS overallPickNumber,
    team_id            AS teamId,
    pokemon_id         AS pokemonId,
    created_at         AS createdAt
  FROM draft_picks
  WHERE season_id = ?
  ORDER BY overall_pick_number DESC, id DESC
  LIMIT 1
`);

const deletePickByIdStmt = dbFile.prepare<[number]>(`
  DELETE FROM draft_picks
  WHERE id = ?
`);

const listWatchlistStmt = dbFile.prepare<[number, number]>(`
  SELECT pokemon_id AS pokemonId
  FROM draft_watchlist
  WHERE season_id = ? AND team_id = ?
  ORDER BY created_at ASC
`);

const clearWatchlistStmt = dbFile.prepare<[number, number]>(`
  DELETE FROM draft_watchlist
  WHERE season_id = ? AND team_id = ?
`);

const insertWatchlistStmt = dbFile.prepare<[number, number, number]>(`
  INSERT OR IGNORE INTO draft_watchlist (season_id, team_id, pokemon_id)
  VALUES (?, ?, ?)
`);

export const draftRepo = {
  getSession(seasonId: number): DraftSessionRow | undefined {
    return getSessionStmt.get(seasonId) as DraftSessionRow | undefined;
  },

  /**
   * Ensure there is a session row for this season.
   * If it doesn't exist, a default "NotStarted / Snake" row is created.
   */
  ensureSession(seasonId: number): DraftSessionRow {
    const existing = this.getSession(seasonId);
    if (existing) return existing;
    return insertDefaultSessionStmt.get(seasonId) as DraftSessionRow;
  },

  /**
   * Patch-style update of a draft session.
   */
  updateSession(
    seasonId: number,
    patch: Partial<
      Pick<
        DraftSessionRow,
        "status" | "type" | "startsAt" | "pickTimerSeconds" | "roundCount"
      >
    >
  ): DraftSessionRow | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (patch.type !== undefined) {
      fields.push("type = ?");
      values.push(patch.type);
    }
    if (patch.startsAt !== undefined) {
      fields.push("starts_at = ?");
      values.push(patch.startsAt);
    }
    if (patch.pickTimerSeconds !== undefined) {
      fields.push("pick_timer_seconds = ?");
      values.push(patch.pickTimerSeconds);
    }
    if (patch.roundCount !== undefined) {
      fields.push("round_count = ?");
      values.push(patch.roundCount);
    }

    if (fields.length === 0) {
      return this.getSession(seasonId);
    }

    const sql = `
      ${updateSessionBaseSql}
      ${fields.join(", ")},
      updated_at = datetime('now')
      WHERE season_id = ?
      RETURNING
        season_id         AS seasonId,
        status            AS status,
        type              AS type,
        starts_at         AS startsAt,
        pick_timer_seconds AS pickTimerSeconds,
        round_count       AS roundCount,
        config_json       AS configJson
    `;

    const stmt = dbFile.prepare(sql);
    const row = stmt.get(...values, seasonId) as DraftSessionRow | undefined;
    return row;
  },

  listParticipants(seasonId: number): DraftParticipantRow[] {
    return listParticipantsStmt.all(seasonId) as DraftParticipantRow[];
  },

  /**
   * Seed participants if there are none yet.
   * Positions are 1-based and follow the given teamIds order.
   */
  seedParticipantsIfEmpty(
    seasonId: number,
    teamIds: number[]
  ): DraftParticipantRow[] {
    const existing = this.listParticipants(seasonId);
    if (existing.length > 0) return existing;

    const tx = dbFile.transaction(() => {
      teamIds.forEach((teamId, idx) => {
        insertParticipantStmt.run(seasonId, teamId, idx + 1, 0);
      });
    });
    tx();

    return this.listParticipants(seasonId);
  },

  setParticipantReady(
    seasonId: number,
    teamId: number,
    isReady: boolean
  ): void {
    updateParticipantReadyStmt.run(isReady ? 1 : 0, seasonId, teamId);
  },

  listPicks(seasonId: number): DraftPickRow[] {
    return listPicksStmt.all(seasonId) as DraftPickRow[];
  },

  insertPick(params: {
    seasonId: number;
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    teamId: number;
    pokemonId: number;
  }): DraftPickRow {
    const row = insertPickStmt.get(
      params.seasonId,
      params.round,
      params.pickInRound,
      params.overallPickNumber,
      params.teamId,
      params.pokemonId
    ) as DraftPickRow;
    return row;
  },

  getLastPick(seasonId: number): DraftPickRow | undefined {
    return getLastPickStmt.get(seasonId) as DraftPickRow | undefined;
  },

  deletePickById(pickId: number): void {
    deletePickByIdStmt.run(pickId);
  },

  listWatchlist(seasonId: number, teamId: number): number[] {
    const rows = listWatchlistStmt.all(seasonId, teamId) as { pokemonId: number }[];
    return rows.map((r) => r.pokemonId);
  },

  replaceWatchlist(seasonId: number, teamId: number, pokemonIds: number[]): void {
    clearWatchlistStmt.run(seasonId, teamId);
    for (const pid of pokemonIds) {
      insertWatchlistStmt.run(seasonId, teamId, pid);
    }
  }
};
