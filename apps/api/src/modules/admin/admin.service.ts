// apps/api/src/modules/admin/admin.service.ts
import { dbFile } from "../../db/index";
import type {
  AdminListQuery,
  AdminUpdateUserBody,
  AdminUpdateLeagueBody,
  AdminUpdateSeasonBody,
  AdminUpdateTeamBody,
  AdminUpdateMatchBody,
  AdminDangerActionBody,
  AdminUpdateFeatureFlagBody
} from "./admin.schemas";

/**
 * Generic list result for admin tables.
 */
type AdminListResult<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

/**
 * Users
 */
export type AdminUserOverview = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: string;
  createdAt: string;
  isBanned: boolean;
};

/**
 * Leagues
 */
export type AdminLeagueOverview = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  visibility: string;
  ownerUserId: number | null;
  createdAt: string;
};

/**
 * Seasons
 */
export type AdminSeasonOverview = {
  id: number;
  leagueId: number;
  name: string;
  description: string | null;
  status: string;
  formatType: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

/**
 * Teams
 */
export type AdminTeamOverview = {
  id: number;
  leagueId: number | null;
  seasonId: number | null;
  name: string;
  logoUrl: string | null;
  managerUserId: number;
  createdAt: string;
};

/**
 * Matches
 */
export type AdminMatchOverview = {
  id: number;
  leagueId: number | null;
  seasonId: number;
  round: number | null;
  teamAId: number;
  teamBId: number;
  status: string;
  scheduledAt: string | null;
  winnerTeamId: number | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  createdAt: string;
};

/**
 * Feature flags
 */
export type AdminFeatureFlagRow = {
  id: number;
  key: string;
  enabled: boolean;
  scope: "global" | "league" | "season";
  leagueId: number | null;
  seasonId: number | null;
};

function normaliseListQuery(
  raw: AdminListQuery
): Required<Pick<AdminListQuery, "page" | "limit">> & {
  search?: string;
} {
  const page = Math.max(1, Number(raw.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(raw.limit) || 20));
  const search = (raw.search ?? "").trim() || undefined;
  return { page, limit, search };
}

function assertId(name: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${name} must be a positive integer`);
    (err as any).statusCode = 400;
    throw err;
  }
  return n;
}

function parseSettings(raw: string | null): any {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export const adminService = {
  // -----------------------------
  // OVERVIEW
  // -----------------------------
  getOverviewSummary() {
    const users = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM users`).get() as any)?.cnt ?? 0;
    const leagues = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM leagues`).get() as any)?.cnt ?? 0;
    const seasons = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM seasons`).get() as any)?.cnt ?? 0;
    const teams = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM teams`).get() as any)?.cnt ?? 0;
    const matches = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM matches`).get() as any)?.cnt ?? 0;

    const disabledUsers = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE disabled_at IS NOT NULL`).get() as any)?.cnt ?? 0;
    const archivedLeagues = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM leagues WHERE archived_at IS NOT NULL`).get() as any)?.cnt ?? 0;
    const archivedSeasons = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM seasons WHERE archived_at IS NOT NULL`).get() as any)?.cnt ?? 0;
    const archivedTeams = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM teams WHERE archived_at IS NOT NULL`).get() as any)?.cnt ?? 0;
    const archivedMatches = (dbFile.prepare(`SELECT COUNT(*) AS cnt FROM matches WHERE status = 'Archived'`).get() as any)?.cnt ?? 0;

    return {
      totals: { users, leagues, seasons, teams, matches },
      archived: {
        users: disabledUsers,
        leagues: archivedLeagues,
        seasons: archivedSeasons,
        teams: archivedTeams,
        matches: archivedMatches
      }
    };
  },

  // -----------------------------
  // USERS
  // -----------------------------
  listUsers(rawQuery: AdminListQuery): AdminListResult<AdminUserOverview> {
    const { page, limit, search } = normaliseListQuery(rawQuery);

    const filters: string[] = [];
    const params: Record<string, any> = {
      limit,
      offset: (page - 1) * limit
    };

    if (search) {
      filters.push(
        "(username LIKE @search OR email LIKE @search OR display_name LIKE @search)"
      );
      params.search = `%${search}%`;
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    const listSql = `
      SELECT
        id,
        username,
        display_name AS displayName,
        email,
        role,
        created_at   AS createdAt,
        settings_json AS settingsJson
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM users
      ${whereClause}
    `;

    const listStmt = dbFile.prepare(listSql);
    const countStmt = dbFile.prepare(countSql);

    const rows = listStmt.all(params) as {
      id: number;
      username: string;
      displayName: string | null;
      email: string | null;
      role: string;
      createdAt: string;
      settingsJson: string | null;
    }[];

    const countRow = countStmt.get(params) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    const items: AdminUserOverview[] = rows.map((r) => {
      const settings = parseSettings(r.settingsJson);
      return {
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        email: r.email,
        role: r.role,
        createdAt: r.createdAt,
        isBanned: !!settings.isBanned
      };
    });

    return { items, page, limit, total };
  },

  updateUser(userIdParam: number | string, body: AdminUpdateUserBody): AdminUserOverview {
    const userId = assertId("userId", userIdParam);

    const existingStmt = dbFile.prepare<[{ id: number }]>(`
      SELECT
        id,
        username,
        display_name AS displayName,
        email,
        role,
        created_at   AS createdAt,
        settings_json AS settingsJson
      FROM users
      WHERE id = ?
    `);

    const existing = existingStmt.get(userId) as
      | {
          id: number;
          username: string;
          displayName: string | null;
          email: string | null;
          role: string;
          createdAt: string;
          settingsJson: string | null;
        }
      | undefined;

    if (!existing) {
      const err = new Error("User not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (body.username !== undefined) {
      fields.push("username = ?");
      values.push(body.username);
    }
    if (body.displayName !== undefined) {
      fields.push("display_name = ?");
      values.push(body.displayName);
    }
    if (body.email !== undefined) {
      fields.push("email = ?");
      values.push(body.email);
    }
    if (body.role !== undefined) {
      fields.push("role = ?");
      values.push(body.role);
    }

    let nextSettings = parseSettings(existing.settingsJson);
    if (body.isBanned !== undefined) {
      nextSettings.isBanned = body.isBanned;
      fields.push("settings_json = ?");
      values.push(JSON.stringify(nextSettings));
    }

    if (fields.length > 0) {
      const sql = `
        UPDATE users
        SET ${fields.join(", ")}
        WHERE id = ?
      `;
      const stmt = dbFile.prepare(sql);
      stmt.run(...values, userId);
    }

    const settings = body.isBanned !== undefined ? nextSettings : parseSettings(existing.settingsJson);

    return {
      id: existing.id,
      username: body.username ?? existing.username,
      displayName: body.displayName ?? existing.displayName,
      email: body.email ?? existing.email,
      role: body.role ?? existing.role,
      createdAt: existing.createdAt,
      isBanned: !!settings.isBanned
    };
  },

  // -----------------------------
  // LEAGUES
  // -----------------------------
  listLeagues(rawQuery: AdminListQuery): AdminListResult<AdminLeagueOverview> {
    const { page, limit, search } = normaliseListQuery(rawQuery);

    const filters: string[] = [];
    const params: Record<string, any> = {
      limit,
      offset: (page - 1) * limit
    };

    if (search) {
      filters.push("(name LIKE @search)");
      params.search = `%${search}%`;
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    const listSql = `
      SELECT
        id,
        name,
        description,
        logo_url  AS logoUrl,
        visibility,
        owner_user_id AS ownerUserId,
        created_at    AS createdAt
      FROM leagues
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM leagues
      ${whereClause}
    `;

    const listStmt = dbFile.prepare(listSql);
    const countStmt = dbFile.prepare(countSql);

    const rows = listStmt.all(params) as AdminLeagueOverview[];
    const countRow = countStmt.get(params) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    return { items: rows, page, limit, total };
  },

  updateLeague(
    leagueIdParam: number | string,
    body: AdminUpdateLeagueBody
  ): AdminLeagueOverview {
    const leagueId = assertId("leagueId", leagueIdParam);

    const existingStmt = dbFile.prepare(`
      SELECT
        id,
        name,
        description,
        logo_url  AS logoUrl,
        visibility,
        owner_user_id AS ownerUserId,
        created_at    AS createdAt
      FROM leagues
      WHERE id = ?
    `);

    const existing = existingStmt.get(leagueId) as AdminLeagueOverview | undefined;
    if (!existing) {
      const err = new Error("League not found");
      (err as any).statusCode = 404;
      throw err;
    }

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
    if (body.logoUrl !== undefined) {
      fields.push("logo_url = ?");
      values.push(body.logoUrl);
    }
    if (body.visibility !== undefined) {
      fields.push("visibility = ?");
      values.push(body.visibility);
    }
    if (body.ownerUserId !== undefined) {
      fields.push("owner_user_id = ?");
      values.push(body.ownerUserId);
    }

    if (fields.length > 0) {
      const sql = `
        UPDATE leagues
        SET ${fields.join(", ")}
        WHERE id = ?
      `;
      const stmt = dbFile.prepare(sql);
      stmt.run(...values, leagueId);
    }

    return {
      ...existing,
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      logoUrl: body.logoUrl ?? existing.logoUrl,
      visibility: body.visibility ?? existing.visibility,
      ownerUserId: body.ownerUserId ?? existing.ownerUserId
    };
  },

  // -----------------------------
  // SEASONS
  // -----------------------------
  listSeasons(rawQuery: AdminListQuery): AdminListResult<AdminSeasonOverview> {
    const { page, limit, search } = normaliseListQuery(rawQuery);

    const filters: string[] = [];
    const params: Record<string, any> = {
      limit,
      offset: (page - 1) * limit
    };

    if (search) {
      filters.push("(name LIKE @search)");
      params.search = `%${search}%`;
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    const listSql = `
      SELECT
        id,
        league_id   AS leagueId,
        name,
        description,
        status,
        format_type AS formatType,
        starts_at   AS startsAt,
        ends_at     AS endsAt,
        created_at  AS createdAt
      FROM seasons
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM seasons
      ${whereClause}
    `;

    const listStmt = dbFile.prepare(listSql);
    const countStmt = dbFile.prepare(countSql);

    const rows = listStmt.all(params) as AdminSeasonOverview[];
    const countRow = countStmt.get(params) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    return { items: rows, page, limit, total };
  },

  updateSeason(
    seasonIdParam: number | string,
    body: AdminUpdateSeasonBody
  ): AdminSeasonOverview {
    const seasonId = assertId("seasonId", seasonIdParam);

    const existingStmt = dbFile.prepare(`
      SELECT
        id,
        league_id   AS leagueId,
        name,
        description,
        status,
        format_type AS formatType,
        starts_at   AS startsAt,
        ends_at     AS endsAt,
        created_at  AS createdAt
      FROM seasons
      WHERE id = ?
    `);

    const existing = existingStmt.get(seasonId) as AdminSeasonOverview | undefined;
    if (!existing) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

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

    if (fields.length > 0) {
      const sql = `
        UPDATE seasons
        SET ${fields.join(", ")}
        WHERE id = ?
      `;
      const stmt = dbFile.prepare(sql);
      stmt.run(...values, seasonId);
    }

    return {
      ...existing,
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      status: body.status ?? existing.status,
      formatType: body.formatType ?? existing.formatType,
      startsAt: body.startsAt ?? existing.startsAt,
      endsAt: body.endsAt ?? existing.endsAt
    };
  },

  // -----------------------------
  // TEAMS
  // -----------------------------
  listTeams(rawQuery: AdminListQuery): AdminListResult<AdminTeamOverview> {
    const { page, limit, search } = normaliseListQuery(rawQuery);

    const filters: string[] = [];
    const params: Record<string, any> = {
      limit,
      offset: (page - 1) * limit
    };

    if (search) {
      filters.push("(name LIKE @search)");
      params.search = `%${search}%`;
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    const listSql = `
      SELECT
        id,
        league_id      AS leagueId,
        season_id      AS seasonId,
        name,
        logo_url       AS logoUrl,
        manager_user_id AS managerUserId,
        created_at     AS createdAt
      FROM teams
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM teams
      ${whereClause}
    `;

    const listStmt = dbFile.prepare(listSql);
    const countStmt = dbFile.prepare(countSql);

    const rows = listStmt.all(params) as AdminTeamOverview[];
    const countRow = countStmt.get(params) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    return { items: rows, page, limit, total };
  },

  updateTeam(
    teamIdParam: number | string,
    body: AdminUpdateTeamBody
  ): AdminTeamOverview {
    const teamId = assertId("teamId", teamIdParam);

    const existingStmt = dbFile.prepare(`
      SELECT
        id,
        league_id      AS leagueId,
        season_id      AS seasonId,
        name,
        logo_url       AS logoUrl,
        manager_user_id AS managerUserId,
        created_at     AS createdAt
      FROM teams
      WHERE id = ?
    `);

    const existing = existingStmt.get(teamId) as AdminTeamOverview | undefined;
    if (!existing) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body.logoUrl !== undefined) {
      fields.push("logo_url = ?");
      values.push(body.logoUrl);
    }
    if (body.managerUserId !== undefined) {
      fields.push("manager_user_id = ?");
      values.push(body.managerUserId);
    }
    if (body.bio !== undefined) {
      // optional column – safe to ignore if not present in schema
      fields.push("bio = ?");
      values.push(body.bio);
    }

    if (fields.length > 0) {
      const sql = `
        UPDATE teams
        SET ${fields.join(", ")}
        WHERE id = ?
      `;
      const stmt = dbFile.prepare(sql);
      stmt.run(...values, teamId);
    }

    return {
      ...existing,
      name: body.name ?? existing.name,
      logoUrl: body.logoUrl ?? existing.logoUrl,
      managerUserId: body.managerUserId ?? existing.managerUserId
    };
  },

  // -----------------------------
  // MATCHES
  // -----------------------------
  listMatches(rawQuery: AdminListQuery): AdminListResult<AdminMatchOverview> {
    const { page, limit } = normaliseListQuery(rawQuery);

    const params: Record<string, any> = {
      limit,
      offset: (page - 1) * limit
    };

    const listSql = `
      SELECT
        id,
        league_id      AS leagueId,
        season_id      AS seasonId,
        round,
        team_a_id      AS teamAId,
        team_b_id      AS teamBId,
        status,
        scheduled_at   AS scheduledAt,
        winner_team_id AS winnerTeamId,
        score_team_a   AS scoreTeamA,
        score_team_b   AS scoreTeamB,
        created_at     AS createdAt
      FROM matches
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `;

    const countSql = `
      SELECT COUNT(*) AS cnt
      FROM matches
    `;

    const listStmt = dbFile.prepare(listSql);
    const countStmt = dbFile.prepare(countSql);

    const rows = listStmt.all(params) as AdminMatchOverview[];
    const countRow = countStmt.get({}) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    return { items: rows, page, limit, total };
  },

  updateMatch(
    matchIdParam: number | string,
    body: AdminUpdateMatchBody
  ): AdminMatchOverview {
    const matchId = assertId("matchId", matchIdParam);

    const existingStmt = dbFile.prepare(`
      SELECT
        id,
        league_id      AS leagueId,
        season_id      AS seasonId,
        round,
        team_a_id      AS teamAId,
        team_b_id      AS teamBId,
        status,
        scheduled_at   AS scheduledAt,
        winner_team_id AS winnerTeamId,
        score_team_a   AS scoreTeamA,
        score_team_b   AS scoreTeamB,
        created_at     AS createdAt
      FROM matches
      WHERE id = ?
    `);

    const existing = existingStmt.get(matchId) as AdminMatchOverview | undefined;
    if (!existing) {
      const err = new Error("Match not found");
      (err as any).statusCode = 404;
      throw err;
    }

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

    if (fields.length > 0) {
      const sql = `
        UPDATE matches
        SET ${fields.join(", ")}
        WHERE id = ?
      `;
      const stmt = dbFile.prepare(sql);
      stmt.run(...values, matchId);
    }

    return {
      ...existing,
      scheduledAt: body.scheduledAt ?? existing.scheduledAt,
      status: body.status ?? existing.status,
      teamAId: body.teamAId ?? existing.teamAId,
      teamBId: body.teamBId ?? existing.teamBId,
      round: body.round ?? existing.round,
      winnerTeamId: body.winnerTeamId ?? existing.winnerTeamId,
      scoreTeamA: body.scoreTeamA ?? existing.scoreTeamA,
      scoreTeamB: body.scoreTeamB ?? existing.scoreTeamB
    };
  },

  // -----------------------------
  // FEATURE FLAGS
  // -----------------------------
  listFeatureFlags(): AdminFeatureFlagRow[] {
    const sql = `
      SELECT
        id,
        key,
        enabled,
        scope,
        league_id AS leagueId,
        season_id AS seasonId
      FROM feature_flags
      ORDER BY key ASC
    `;
    const stmt = dbFile.prepare(sql);
    const rows = stmt.all() as {
      id: number;
      key: string;
      enabled: number;
      scope: string;
      leagueId: number | null;
      seasonId: number | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      enabled: !!r.enabled,
      scope: (r.scope as any) || "global",
      leagueId: r.leagueId,
      seasonId: r.seasonId
    }));
  },

  updateFeatureFlag(body: AdminUpdateFeatureFlagBody): AdminFeatureFlagRow {
    const scope = body.scope ?? "global";
    const leagueId = body.leagueId ?? null;
    const seasonId = body.seasonId ?? null;

    const upsertSql = `
      INSERT INTO feature_flags (key, enabled, scope, league_id, season_id)
      VALUES (@key, @enabled, @scope, @leagueId, @seasonId)
      ON CONFLICT(key, COALESCE(league_id, -1), COALESCE(season_id, -1)) DO UPDATE SET
        enabled = excluded.enabled,
        scope = excluded.scope,
        league_id = excluded.league_id,
        season_id = excluded.season_id
      RETURNING
        id,
        key,
        enabled,
        scope,
        league_id AS leagueId,
        season_id AS seasonId
    `;

    const stmt = dbFile.prepare(upsertSql);
    const row = stmt.get({
      key: body.key,
      enabled: body.enabled ? 1 : 0,
      scope,
      leagueId,
      seasonId
    }) as {
      id: number;
      key: string;
      enabled: number;
      scope: string;
      leagueId: number | null;
      seasonId: number | null;
    };

    return {
      id: row.id,
      key: row.key,
      enabled: !!row.enabled,
      scope: row.scope as any,
      leagueId: row.leagueId,
      seasonId: row.seasonId
    };
  },

  // -----------------------------
  // ARCHIVE / DISABLE (soft)
  // -----------------------------
  deleteUser(userIdParam: number | string): { ok: true } {
    const userId = assertId("userId", userIdParam);
    const info = dbFile
      .prepare(`UPDATE users SET disabled_at = datetime('now') WHERE id = ? AND disabled_at IS NULL`)
      .run(userId);
    if ((info.changes ?? 0) === 0) {
      // either not found or already disabled
      const exists = dbFile.prepare(`SELECT id FROM users WHERE id = ?`).get(userId) as any;
      if (!exists) {
        const err = new Error("User not found");
        (err as any).statusCode = 404;
        throw err;
      }
    }
    return { ok: true };
  },

  deleteLeague(leagueIdParam: number | string): { ok: true } {
    const leagueId = assertId("leagueId", leagueIdParam);
    const info = dbFile
      .prepare(`UPDATE leagues SET archived_at = datetime('now') WHERE id = ? AND archived_at IS NULL`)
      .run(leagueId);
    if ((info.changes ?? 0) === 0) {
      const exists = dbFile.prepare(`SELECT id FROM leagues WHERE id = ?`).get(leagueId) as any;
      if (!exists) {
        const err = new Error("League not found");
        (err as any).statusCode = 404;
        throw err;
      }
    }
    return { ok: true };
  },

  deleteSeason(seasonIdParam: number | string): { ok: true } {
    const seasonId = assertId("seasonId", seasonIdParam);
    const info = dbFile
      .prepare(`UPDATE seasons SET archived_at = datetime('now') WHERE id = ? AND archived_at IS NULL`)
      .run(seasonId);
    if ((info.changes ?? 0) === 0) {
      const exists = dbFile.prepare(`SELECT id FROM seasons WHERE id = ?`).get(seasonId) as any;
      if (!exists) {
        const err = new Error("Season not found");
        (err as any).statusCode = 404;
        throw err;
      }
    }
    return { ok: true };
  },

  deleteTeam(teamIdParam: number | string): { ok: true } {
    const teamId = assertId("teamId", teamIdParam);
    const info = dbFile
      .prepare(`UPDATE teams SET archived_at = datetime('now') WHERE id = ? AND archived_at IS NULL`)
      .run(teamId);
    if ((info.changes ?? 0) === 0) {
      const exists = dbFile.prepare(`SELECT id FROM teams WHERE id = ?`).get(teamId) as any;
      if (!exists) {
        const err = new Error("Team not found");
        (err as any).statusCode = 404;
        throw err;
      }
    }
    return { ok: true };
  },

  deleteMatch(matchIdParam: number | string): { ok: true } {
    const matchId = assertId("matchId", matchIdParam);
    const info = dbFile
      .prepare(`UPDATE matches SET status = 'Archived', updated_at = datetime('now') WHERE id = ? AND status <> 'Archived'`)
      .run(matchId);
    if ((info.changes ?? 0) === 0) {
      const exists = dbFile.prepare(`SELECT id FROM matches WHERE id = ?`).get(matchId) as any;
      if (!exists) {
        const err = new Error("Match not found");
        (err as any).statusCode = 404;
        throw err;
      }
    }
    return { ok: true };
  },

  // -----------------------------
  // DANGER ZONE
  // -----------------------------
  dangerDeleteLeague(
    leagueIdParam: number | string,
    body: AdminDangerActionBody
  ): { deletedSeasons: number; deletedTeams: number; deletedLeague: number } {
    const leagueId = assertId("leagueId", leagueIdParam);

    if (!body.confirm || body.confirm.trim().length === 0) {
      const err = new Error("Danger action requires confirmation text");
      (err as any).statusCode = 400;
      throw err;
    }

    // For now we only check that some confirm text is supplied; if you want
    // stricter matching (e.g. league name or "DELETE"), enforce it here.

    const tx = dbFile.transaction(() => {
      const delMatches = dbFile.prepare(`
        DELETE FROM matches
        WHERE league_id = ?
      `);
      delMatches.run(leagueId);

      const delTeams = dbFile.prepare(`
        DELETE FROM teams
        WHERE league_id = ?
      `);
      const teamsInfo = delTeams.run(leagueId);

      const delSeasons = dbFile.prepare(`
        DELETE FROM seasons
        WHERE league_id = ?
      `);
      const seasonsInfo = delSeasons.run(leagueId);

      const delLeague = dbFile.prepare(`
        DELETE FROM leagues
        WHERE id = ?
      `);
      const leagueInfo = delLeague.run(leagueId);

      return {
        deletedSeasons: seasonsInfo.changes ?? 0,
        deletedTeams: teamsInfo.changes ?? 0,
        deletedLeague: leagueInfo.changes ?? 0
      };
    });

    return tx();
  },

  dangerWipeSeason(
    seasonIdParam: number | string,
    body: AdminDangerActionBody
  ): { deletedMatches: number; deletedTeams: number } {
    const seasonId = assertId("seasonId", seasonIdParam);

    if (!body.confirm || body.confirm.trim().length === 0) {
      const err = new Error("Danger action requires confirmation text");
      (err as any).statusCode = 400;
      throw err;
    }

    const tx = dbFile.transaction(() => {
      const delMatches = dbFile.prepare(`
        DELETE FROM matches
        WHERE season_id = ?
      `);
      const matchesInfo = delMatches.run(seasonId);

      const delTeams = dbFile.prepare(`
        DELETE FROM teams
        WHERE season_id = ?
      `);
      const teamsInfo = delTeams.run(seasonId);

      return {
        deletedMatches: matchesInfo.changes ?? 0,
        deletedTeams: teamsInfo.changes ?? 0
      };
    });

    return tx();
  }
};
