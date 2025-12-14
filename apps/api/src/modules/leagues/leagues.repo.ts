// apps/api/src/modules/leagues/leagues.repo.ts
import { dbFile } from "../../db/index";
import type {
  LeagueVisibility,
  LeagueMemberRole,
  LeagueSummary,
  LeagueMemberSummary,
  LeagueSeasonSummary
} from "./leagues.schemas";

export type LeagueRow = {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  visibility: LeagueVisibility;
  password_hash: string | null;
  owner_user_id: number;
  sport: string | null;
  created_at: string;
};

export type LeagueMemberRow = {
  league_id: number;
  user_id: number;
  role: LeagueMemberRole;
  joined_at: string;
};

export const leaguesRepo = {
  findById(id: number): LeagueRow | null {
    const row = dbFile
      .prepare<LeagueRow>(
        `SELECT id, name, description, logo_url, visibility,
                password_hash, owner_user_id, sport, created_at
         FROM leagues
         WHERE id = ?`
      )
      .get(id) as LeagueRow | undefined;
    return row ?? null;
  },

  findByIdWithOwnerAndCounts(
    id: number
  ): (LeagueSummary & { createdAt: string }) | null {
    const row = dbFile
      .prepare(
        `
        SELECT
          l.id,
          l.name,
          l.description,
          l.logo_url,
          l.visibility,
          l.owner_user_id,
          l.created_at,
          u.username AS owner_username,
          (
            SELECT COUNT(*)
            FROM league_members lm
            WHERE lm.league_id = l.id
          ) AS member_count,
          (
            SELECT COUNT(*)
            FROM seasons s
            WHERE s.league_id = l.id
              AND s.status IN ('Signup','Drafting','Active','Playoffs')
          ) AS active_season_count
        FROM leagues l
        LEFT JOIN users u ON u.id = l.owner_user_id
        WHERE l.id = ?
      `
      )
      .get(id) as
      | {
          id: number;
          name: string;
          description: string | null;
          logo_url: string | null;
          visibility: LeagueVisibility;
          owner_user_id: number;
          created_at: string;
          owner_username: string | null;
          member_count: number;
          active_season_count: number;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      logoUrl: row.logo_url,
      visibility: row.visibility,
      ownerUserId: row.owner_user_id,
      ownerUsername: row.owner_username,
      memberCount: row.member_count,
      activeSeasonCount: row.active_season_count,
      createdAt: row.created_at
    };
  },

  listDiscover(
    search: string | undefined,
    visibility: LeagueVisibility | "all" | undefined,
    limit: number,
    offset: number
  ): { items: LeagueSummary[]; total: number } {
    const params: any[] = [];
    let where = "WHERE 1=1";

    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      where += ` AND (l.name LIKE ? OR l.description LIKE ?)`;
      params.push(like, like);
    }

    if (visibility && visibility !== "all") {
      where += ` AND l.visibility = ?`;
      params.push(visibility);
    }

    const totalRow = dbFile
      .prepare<{ c: number }>(`SELECT COUNT(*) AS c FROM leagues l ${where}`)
      .get(...params) as { c: number };

    const rows = dbFile
      .prepare(
        `
        SELECT
          l.id,
          l.name,
          l.description,
          l.logo_url,
          l.visibility,
          l.owner_user_id,
          u.username AS owner_username,
          (
            SELECT COUNT(*)
            FROM league_members lm
            WHERE lm.league_id = l.id
          ) AS member_count,
          (
            SELECT COUNT(*)
            FROM seasons s
            WHERE s.league_id = l.id
              AND s.status IN ('Signup','Drafting','Active','Playoffs')
          ) AS active_season_count
        FROM leagues l
        LEFT JOIN users u ON u.id = l.owner_user_id
        ${where}
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, limit, offset) as Array<{
        id: number;
        name: string;
        description: string | null;
        logo_url: string | null;
        visibility: LeagueVisibility;
        owner_user_id: number;
        owner_username: string | null;
        member_count: number;
        active_season_count: number;
      }>;

    const items: LeagueSummary[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      logoUrl: r.logo_url,
      visibility: r.visibility,
      ownerUserId: r.owner_user_id,
      ownerUsername: r.owner_username,
      memberCount: r.member_count,
      activeSeasonCount: r.active_season_count
    }));

    return { items, total: totalRow.c ?? 0 };
  },

  listForUser(userId: number): LeagueSummary[] {
    const rows = dbFile
      .prepare(
        `
        SELECT
          l.id,
          l.name,
          l.description,
          l.logo_url,
          l.visibility,
          l.owner_user_id,
          u.username AS owner_username,
          (
            SELECT COUNT(*)
            FROM league_members lm2
            WHERE lm2.league_id = l.id
          ) AS member_count,
          (
            SELECT COUNT(*)
            FROM seasons s
            WHERE s.league_id = l.id
              AND s.status IN ('Signup','Drafting','Active','Playoffs')
          ) AS active_season_count
        FROM league_members lm
        JOIN leagues l ON l.id = lm.league_id
        LEFT JOIN users u ON u.id = l.owner_user_id
        WHERE lm.user_id = ?
        ORDER BY l.created_at DESC
      `
      )
      .all(userId) as Array<{
        id: number;
        name: string;
        description: string | null;
        logo_url: string | null;
        visibility: LeagueVisibility;
        owner_user_id: number;
        owner_username: string | null;
        member_count: number;
        active_season_count: number;
      }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      logoUrl: r.logo_url,
      visibility: r.visibility,
      ownerUserId: r.owner_user_id,
      ownerUsername: r.owner_username,
      memberCount: r.member_count,
      activeSeasonCount: r.active_season_count
    }));
  },

  createLeague(
    ownerUserId: number,
    params: {
      name: string;
      description: string | null;
      logoUrl: string | null;
      visibility: LeagueVisibility;
      passwordHash: string | null;
      sport: string | null;
    }
  ): LeagueRow {
    const stmt = dbFile.prepare(
      `
      INSERT INTO leagues (name, description, logo_url, visibility,
                           password_hash, owner_user_id, sport)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    );

    const info = stmt.run(
      params.name,
      params.description,
      params.logoUrl,
      params.visibility,
      params.passwordHash,
      ownerUserId,
      params.sport
    );

    const id = Number(info.lastInsertRowid);

    return this.findById(id)!;
  },

  updateLeague(
    leagueId: number,
    params: Partial<{
      name: string;
      description: string | null;
      logoUrl: string | null;
      visibility: LeagueVisibility;
      passwordHash: string | null;
    }>
  ): LeagueRow {
    const stmt = dbFile.prepare(
      `
      UPDATE leagues
      SET
        name = COALESCE(@name, name),
        description = COALESCE(@description, description),
        logo_url = COALESCE(@logo_url, logo_url),
        visibility = COALESCE(@visibility, visibility),
        password_hash = COALESCE(@password_hash, password_hash)
      WHERE id = @id
    `
    );

    stmt.run({
      id: leagueId,
      name: params.name ?? null,
      description: params.description ?? null,
      logo_url: params.logoUrl ?? null,
      visibility: params.visibility ?? null,
      password_hash: params.passwordHash ?? null
    });

    const updated = this.findById(leagueId);
    if (!updated) {
      throw new Error("Failed to load league after update");
    }
    return updated;
  },

  deleteLeague(leagueId: number): void {
    dbFile.prepare(`DELETE FROM leagues WHERE id = ?`).run(leagueId);
  },

  // Membership

  getMember(leagueId: number, userId: number): LeagueMemberRow | null {
    const row = dbFile
      .prepare<LeagueMemberRow>(
        `SELECT league_id, user_id, role, joined_at
         FROM league_members
         WHERE league_id = ? AND user_id = ?`
      )
      .get(leagueId, userId) as LeagueMemberRow | undefined;
    return row ?? null;
  },

  addMember(
    leagueId: number,
    userId: number,
    role: LeagueMemberRole
  ): LeagueMemberRow {
    dbFile
      .prepare(
        `
        INSERT OR IGNORE INTO league_members (league_id, user_id, role, joined_at)
        VALUES (?, ?, ?, datetime('now'))
      `
      )
      .run(leagueId, userId, role);

    const row = dbFile
      .prepare<LeagueMemberRow>(
        `SELECT league_id, user_id, role, joined_at
         FROM league_members
         WHERE league_id = ? AND user_id = ?`
      )
      .get(leagueId, userId) as LeagueMemberRow | undefined;

    if (!row) {
      throw new Error("Failed to read membership after insert");
    }

    return row;
  },

  updateMemberRole(
    leagueId: number,
    userId: number,
    role: LeagueMemberRole
  ): LeagueMemberRow {
    dbFile
      .prepare(
        `
        UPDATE league_members
        SET role = ?
        WHERE league_id = ? AND user_id = ?
      `
      )
      .run(role, leagueId, userId);

    const row = dbFile
      .prepare<LeagueMemberRow>(
        `SELECT league_id, user_id, role, joined_at
         FROM league_members
         WHERE league_id = ? AND user_id = ?`
      )
      .get(leagueId, userId) as LeagueMemberRow | undefined;

    if (!row) {
      throw new Error("Failed to read membership after update");
    }

    return row;
  },

  removeMember(leagueId: number, userId: number): void {
    dbFile
      .prepare(`DELETE FROM league_members WHERE league_id = ? AND user_id = ?`)
      .run(leagueId, userId);
  },

  listMembers(leagueId: number): LeagueMemberSummary[] {
    const rows = dbFile
      .prepare(
        `
        SELECT
          lm.league_id,
          lm.user_id,
          lm.role,
          lm.joined_at,
          u.username,
          u.display_name
        FROM league_members lm
        JOIN users u ON u.id = lm.user_id
        WHERE lm.league_id = ?
        ORDER BY
          CASE lm.role
            WHEN 'owner' THEN 0
            WHEN 'commissioner' THEN 1
            ELSE 2
          END,
          lm.joined_at ASC
      `
      )
      .all(leagueId) as Array<{
        user_id: number;
        username: string;
        display_name: string | null;
        role: LeagueMemberRole;
        joined_at: string;
      }>;

    return rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      joinedAt: r.joined_at
    }));
  },

  listSeasonsForLeague(leagueId: number): LeagueSeasonSummary[] {
    const rows = dbFile
      .prepare(
        `
        SELECT
          id,
          name,
          status,
          format_type,
          starts_at,
          ends_at
        FROM seasons
        WHERE league_id = ?
        ORDER BY id DESC
      `
      )
      .all(leagueId) as Array<{
        id: number;
        name: string;
        status: LeagueSeasonSummary["status"];
        format_type: LeagueSeasonSummary["formatType"];
        starts_at: string | null;
        ends_at: string | null;
      }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      formatType: r.format_type,
      startsAt: r.starts_at,
      endsAt: r.ends_at
    }));
  }
};
