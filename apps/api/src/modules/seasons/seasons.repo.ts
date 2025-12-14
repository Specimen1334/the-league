// apps/api/src/modules/seasons/seasons.repo.ts
import { dbFile } from "../../db/index";
import type {
  SeasonStatus,
  SeasonFormatType,
  SeasonUpdateBody,
  SeasonSettings
} from "./seasons.schemas";

/**
 * Core Season row as stored in the DB.
 *
 * Expected tables:
 *
 * CREATE TABLE seasons (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   league_id INTEGER,
 *   name TEXT NOT NULL,
 *   description TEXT,
 *   status TEXT NOT NULL,
 *   format_type TEXT NOT NULL,
 *   starts_at TEXT,
 *   ends_at TEXT,
 *   created_at TEXT NOT NULL DEFAULT (datetime('now'))
 * );
 *
 * CREATE TABLE season_settings (
 *   season_id INTEGER PRIMARY KEY,
 *   settings_json TEXT NOT NULL
 * );
 */
export type SeasonRow = {
  id: number;
  leagueId: number | null;
  name: string;
  description: string | null;
  status: SeasonStatus;
  formatType: SeasonFormatType;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

const DEFAULT_SEASON_STATUS: SeasonStatus = "Signup";
const DEFAULT_SEASON_FORMAT: SeasonFormatType = "RoundRobin";

// Defaults for season-scoped config.
// If your design doc specifies different defaults, we can adjust later,
// but these are safe, sensible release defaults.
const DEFAULT_SETTINGS: SeasonSettings = {
  pickTimerSeconds: 90,
  roundCount: 11,
  draftType: "Snake",
  allowTrades: true,
  tradeDeadlineAt: null
};

function ensureSeasonSettingsRow(seasonId: number) {
  dbFile
    .prepare<[number, string]>(`
      INSERT OR IGNORE INTO season_settings (season_id, settings_json)
      VALUES (?, ?)
    `)
    .run(seasonId, JSON.stringify(DEFAULT_SETTINGS));
}

const selectSeasonBase = `
  SELECT
    id,
    league_id   AS leagueId,
    name,
    description,
    status       AS status,
    format_type  AS formatType,
    starts_at    AS startsAt,
    ends_at      AS endsAt,
    created_at   AS createdAt
  FROM seasons
`;

const getSeasonByIdStmt = dbFile.prepare<[number]>(`
  ${selectSeasonBase}
  WHERE id = ?
`);

const listSeasonsByLeagueStmt = dbFile.prepare<[number]>(`
  ${selectSeasonBase}
  WHERE league_id = ?
  ORDER BY created_at ASC
`);

const insertSeasonStmt = dbFile.prepare<
  [number | null, string, string | null, string, string, string | null, string | null]
>(`
  INSERT INTO seasons (
    league_id,
    name,
    description,
    status,
    format_type,
    starts_at,
    ends_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    league_id   AS leagueId,
    name,
    description,
    status       AS status,
    format_type  AS formatType,
    starts_at    AS startsAt,
    ends_at      AS endsAt,
    created_at   AS createdAt
`);

const getSeasonSettingsStmt = dbFile.prepare<[number]>(`
  SELECT settings_json AS settingsJson
  FROM season_settings
  WHERE season_id = ?
`);

const upsertSeasonSettingsStmt = dbFile.prepare<[number, string]>(`
  INSERT INTO season_settings (season_id, settings_json)
  VALUES (?, ?)
  ON CONFLICT(season_id) DO UPDATE SET settings_json = excluded.settings_json
`);

export const seasonsRepo = {
  getSeasonById(seasonId: number): SeasonRow | undefined {
    return getSeasonByIdStmt.get(seasonId) as SeasonRow | undefined;
  },

  listSeasonsByLeague(leagueId: number): SeasonRow[] {
    return listSeasonsByLeagueStmt.all(leagueId) as SeasonRow[];
  },

  /**
   * Create a season and ensure a default settings row exists.
   * Accepts optional status/formatType; defaults to Signup/RoundRobin.
   */
  createSeason(params: {
    leagueId: number | null;
    name: string;
    description?: string | null;
    status?: SeasonStatus;
    formatType?: SeasonFormatType;
    startsAt?: string | null;
    endsAt?: string | null;
  }): SeasonRow {
    const {
      leagueId,
      name,
      description = null,
      status = DEFAULT_SEASON_STATUS,
      formatType = DEFAULT_SEASON_FORMAT,
      startsAt = null,
      endsAt = null
    } = params;

    const row = insertSeasonStmt.get(
      leagueId,
      name,
      description,
      status,
      formatType,
      startsAt,
      endsAt
    ) as SeasonRow;

    ensureSeasonSettingsRow(row.id);

    return row;
  },

  /**
   * Patch-style update of a season. Only updates fields present
   * in the body object.
   */
  updateSeason(seasonId: number, body: SeasonUpdateBody): SeasonRow | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body.description !== undefined) {
      fields.push("description = ?");
      values.push(body.description);
    }
    if (body.status !== undefined) {
      fields.push("status = ?");
      values.push(body.status);
    }
    if (body.formatType !== undefined) {
      fields.push("format_type = ?");
      values.push(body.formatType);
    }
    if (body.startsAt !== undefined) {
      fields.push("starts_at = ?");
      values.push(body.startsAt);
    }
    if (body.endsAt !== undefined) {
      fields.push("ends_at = ?");
      values.push(body.endsAt);
    }

    if (fields.length === 0) {
      return this.getSeasonById(seasonId);
    }

    const sql = `
      UPDATE seasons
      SET ${fields.join(", ")}
      WHERE id = ?
      RETURNING
        id,
        league_id   AS leagueId,
        name,
        description,
        status       AS status,
        format_type  AS formatType,
        starts_at    AS startsAt,
        ends_at      AS endsAt,
        created_at   AS createdAt
    `;

    const stmt = dbFile.prepare(sql);
    return stmt.get(...values, seasonId) as SeasonRow | undefined;
  },

  /**
   * Season settings (draft/trade config)
   */
  getSeasonSettings(seasonId: number): SeasonSettings {
    ensureSeasonSettingsRow(seasonId);

    const row = getSeasonSettingsStmt.get(seasonId) as
      | { settingsJson: string }
      | undefined;

    if (!row) return { ...DEFAULT_SETTINGS };

    try {
      const parsed = JSON.parse(row.settingsJson);
      return { ...DEFAULT_SETTINGS, ...(parsed ?? {}) } as SeasonSettings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  updateSeasonSettings(
    seasonId: number,
    patch: Partial<SeasonSettings>
  ): SeasonSettings {
    const current = this.getSeasonSettings(seasonId);
    const next: SeasonSettings = { ...current, ...patch };

    upsertSeasonSettingsStmt.run(seasonId, JSON.stringify(next));
    return next;
  }
};
