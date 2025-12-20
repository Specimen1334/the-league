// apps/api/src/modules/pokedex/pokedex.repo.ts
import { dbFile } from "../../db/index";
import type {
  PokedexBrowseQuery,
  PokedexEntry,
  PokedexSeasonContext,
  PokedexBalanceVotesQuery,
  PokedexBalanceVoteItem
} from "./pokedex.schemas";

/**
 * Expected tables (for reference – not created here):
 *
 * pokedex_entries
 *  - id INTEGER PRIMARY KEY (pokemonId)
 *  - dex_number INTEGER
 *  - name TEXT NOT NULL
 *  - form_name TEXT
 *  - types_json TEXT NOT NULL         -- '["Fire","Flying"]'
 *  - roles_json TEXT NOT NULL         -- '["Wallbreaker"]'
 *  - base_cost INTEGER
 *  - base_stats_json TEXT             -- '{"hp":90,...}'
 *  - tags_json TEXT NOT NULL          -- '["OU","Legendary"]'
 *  - sprite_url TEXT
 *
 * pokedex_season_overrides
 *  - season_id INTEGER
 *  - league_id INTEGER
 *  - pokemon_id INTEGER
 *  - is_banned INTEGER NOT NULL DEFAULT 0
 *  - override_cost INTEGER
 *  - PRIMARY KEY (season_id, pokemon_id)
 *
 * pokedex_votes
 *  - id INTEGER PRIMARY KEY
 *  - user_id INTEGER NOT NULL
 *  - league_id INTEGER
 *  - season_id INTEGER
 *  - pokemon_id INTEGER NOT NULL
 *  - vote_type TEXT NOT NULL          -- 'ban' | 'unban' | 'cost'
 *  - target_cost INTEGER              -- for cost votes
 *  - reason TEXT
 *  - created_at TEXT NOT NULL DEFAULT (datetime('now'))
 */

export type PokedexEntryRow = {
  id: number;
  dex_number: number | null;
  name: string;
  form_name: string | null;
  types_json: string;
  roles_json: string;
  base_cost: number | null;
  base_stats_json: string | null;
  tags_json: string;
  sprite_url: string | null;
};

export type SeasonOverrideRow = {
  league_id: number | null;
  season_id: number | null;
  pokemon_id: number;
  is_banned: number;
  override_cost: number | null;
};

const getEntryByIdStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    dex_number,
    name,
    form_name,
    types_json,
    roles_json,
    base_cost,
    base_stats_json,
    tags_json,
    sprite_url
  FROM pokedex_entries
  WHERE id = ?
`);

const browseBaseSql = `
  SELECT
    e.id,
    e.dex_number,
    e.name,
    e.form_name,
    e.types_json,
    e.roles_json,
    e.base_cost,
    e.base_stats_json,
    e.tags_json,
    e.sprite_url,
    o.is_banned,
    o.override_cost
  FROM pokedex_entries e
  LEFT JOIN pokedex_season_overrides o
    ON o.pokemon_id = e.id
    AND (o.season_id = @seasonId OR @seasonId IS NULL)
    AND (o.league_id = @leagueId OR @leagueId IS NULL)
`;

const countBrowseBaseSql = `
  SELECT COUNT(*) AS cnt
  FROM pokedex_entries e
  LEFT JOIN pokedex_season_overrides o
    ON o.pokemon_id = e.id
    AND (o.season_id = @seasonId OR @seasonId IS NULL)
    AND (o.league_id = @leagueId OR @leagueId IS NULL)
`;

// Dynamic filters are appended in code.

const insertBanVoteStmt = dbFile.prepare<
  [number, number | null, number | null, number, string, string | null]
>(`
  INSERT INTO pokedex_votes (
    user_id, league_id, season_id,
    pokemon_id, vote_type, reason
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertCostVoteStmt = dbFile.prepare<
  [number, number | null, number | null, number, number, string | null]
>(`
  INSERT INTO pokedex_votes (
    user_id, league_id, season_id,
    pokemon_id, vote_type, target_cost, reason
  )
  VALUES (?, ?, ?, ?, 'cost', ?, ?)
`);

// NOTE: Use positional parameters only. Mixing positional `?` and named `@param`
// triggers better-sqlite3 bind errors ("Too many parameter values were provided").
//
// Params:
//  1) pokemonId
//  2) seasonId (nullable)
//  3) seasonId (nullable) - repeated for (? IS NULL OR season_id = ?)
//  4) leagueId (nullable)
//  5) leagueId (nullable) - repeated for (? IS NULL OR league_id = ?)
const getSeasonOverrideStmt = dbFile.prepare<
  [number, number | null, number | null, number | null, number | null]
>(`
  SELECT
    league_id,
    season_id,
    pokemon_id,
    is_banned,
    override_cost
  FROM pokedex_season_overrides
  WHERE pokemon_id = ?
    AND (? IS NULL OR season_id = ?)
    AND (? IS NULL OR league_id = ?)
  LIMIT 1
`);

export const pokedexRepo = {
  getEntryById(pokemonId: number): PokedexEntry | undefined {
    const row = getEntryByIdStmt.get(pokemonId) as PokedexEntryRow | undefined;
    if (!row) return undefined;

    const types = safeParseStringArray(row.types_json);
    const roles = safeParseStringArray(row.roles_json);
    const tags = safeParseStringArray(row.tags_json);
    const baseStats =
      row.base_stats_json != null
        ? safeParseObject(row.base_stats_json)
        : null;

    return {
      pokemonId: row.id,
      dexNumber: row.dex_number,
      name: row.name,
      formName: row.form_name,
      types,
      roles,
      baseCost: row.base_cost,
      baseStats,
      tags,
      spriteUrl: row.sprite_url
    };
  },

  /**
   * Browse entries with simple filters & pagination.
   */
  browseEntries(
    query: Required<Pick<PokedexBrowseQuery, "page" | "limit">> &
      Omit<PokedexBrowseQuery, "page" | "limit">
  ) {
    const {
      page,
      limit,
      search,
      type,
      role,
      minCost,
      maxCost,
      leagueId,
      seasonId,
      sortBy = "name",
      legality,
      draftableOnly
    } = query;

    const filters: string[] = [];
    const params: Record<string, any> = {
      leagueId: leagueId ?? null,
      seasonId: seasonId ?? null
    };

    if (search) {
      filters.push("e.name LIKE @search");
      params.search = `%${search}%`;
    }
    if (type) {
      filters.push("e.types_json LIKE @type");
      params.type = `%"${type}"%`;
    }
    if (role) {
      filters.push("e.roles_json LIKE @role");
      params.role = `%"${role}"%`;
    }
    if (minCost !== undefined) {
      filters.push("(COALESCE(o.override_cost, e.base_cost) >= @minCost)");
      params.minCost = minCost;
    }
    if (maxCost !== undefined) {
      filters.push("(COALESCE(o.override_cost, e.base_cost) <= @maxCost)");
      params.maxCost = maxCost;
    }

    if (draftableOnly) {
      // Draftable by definition: base_cost is present. Overrides do not change draftability.
      filters.push("e.base_cost IS NOT NULL");
    }

    if (legality === "allowed") {
      filters.push("(o.is_banned IS NULL OR o.is_banned = 0)");
    } else if (legality === "banned") {
      filters.push("o.is_banned = 1");
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    let orderClause = "ORDER BY e.name ASC";
    if (sortBy === "cost_low") {
      orderClause =
        "ORDER BY COALESCE(o.override_cost, e.base_cost) ASC, e.name ASC";
    } else if (sortBy === "cost_high") {
      orderClause =
        "ORDER BY COALESCE(o.override_cost, e.base_cost) DESC, e.name ASC";
    } else if (sortBy === "bst_high") {
      // Requires SQLite JSON1 extension
      const bstExpr = `(
        COALESCE(json_extract(e.base_stats_json,'$.hp'),0)+
        COALESCE(json_extract(e.base_stats_json,'$.atk'),0)+
        COALESCE(json_extract(e.base_stats_json,'$.def'),0)+
        COALESCE(json_extract(e.base_stats_json,'$.spa'),0)+
        COALESCE(json_extract(e.base_stats_json,'$.spd'),0)+
        COALESCE(json_extract(e.base_stats_json,'$.spe'),0)
      )`;
      orderClause = `ORDER BY ${bstExpr} DESC, e.name ASC`;
    }

    const offset = (page - 1) * limit;
	 params.limit = limit;   // 👈 ADD
  params.offset = offset;
    const itemsSql = `
      ${browseBaseSql}
      ${whereClause}
      ${orderClause}
      LIMIT @limit OFFSET @offset
    `;

    const countFilters: string[] = [];
    const countParams: Record<string, any> = {
      leagueId: leagueId ?? null,
      seasonId: seasonId ?? null
    };
    if (search) {
      countFilters.push("e.name LIKE @search");
      countParams.search = `%${search}%`;
    }
    if (type) {
      countFilters.push("e.types_json LIKE @type");
      countParams.type = `%%\"${type}\"%%`.replace(/%%/g, "%");
    }
    if (role) {
      countFilters.push("e.roles_json LIKE @role");
      countParams.role = `%%\"${role}\"%%`.replace(/%%/g, "%");
    }
    if (minCost !== undefined) {
      countFilters.push("(COALESCE(o.override_cost, e.base_cost) >= @minCost)");
      countParams.minCost = minCost;
    }
    if (maxCost !== undefined) {
      countFilters.push("(COALESCE(o.override_cost, e.base_cost) <= @maxCost)");
      countParams.maxCost = maxCost;
    }
    if (draftableOnly) {
      countFilters.push("e.base_cost IS NOT NULL");
    }
    if (legality === "allowed") {
      countFilters.push("(o.is_banned IS NULL OR o.is_banned = 0)");
    } else if (legality === "banned") {
      countFilters.push("o.is_banned = 1");
    }

    const countWhere =
      countFilters.length > 0 ? "WHERE " + countFilters.join(" AND ") : "";
    const countSql = `
      ${countBrowseBaseSql}
      ${countWhere}
    `;

    const itemsStmt = dbFile.prepare(itemsSql);
    const rows = itemsStmt.all({
      ...params,
      limit,
      offset
    }) as (PokedexEntryRow & {
      is_banned: number | null;
      override_cost: number | null;
    })[];

    const countStmt = dbFile.prepare(countSql);
    const countRow = countStmt.get(countParams) as { cnt: number } | undefined;
    const total = countRow?.cnt ?? 0;

    return { rows, total };
  },

  getSeasonContext(
    pokemonId: number,
    leagueId?: number,
    seasonId?: number
  ): PokedexSeasonContext | undefined {
    const stmt = getSeasonOverrideStmt;
    const row = stmt.get(
      pokemonId,
      seasonId ?? null,
      seasonId ?? null,
      leagueId ?? null,
      leagueId ?? null
    ) as SeasonOverrideRow | undefined;

    if (!row) {
      return {
        leagueId: leagueId ?? null,
        seasonId: seasonId ?? null,
        pokemonId,
        isBanned: false,
        overrideCost: null,
        effectiveCost: null
      };
    }

    return {
      leagueId: row.league_id,
      seasonId: row.season_id,
      pokemonId: row.pokemon_id,
      isBanned: !!row.is_banned,
      overrideCost: row.override_cost,
      effectiveCost: null // filled at service layer using baseCost
    };
  },

  insertBanVote(params: {
    userId: number;
    leagueId?: number;
    seasonId?: number;
    pokemonId: number;
    vote: "ban" | "unban";
    reason?: string;
  }) {
    insertBanVoteStmt.run(
      params.userId,
      params.leagueId ?? null,
      params.seasonId ?? null,
      params.pokemonId,
      params.vote,
      params.reason ?? null
    );
  },

  insertCostVote(params: {
    userId: number;
    leagueId?: number;
    seasonId?: number;
    pokemonId: number;
    targetCost: number;
    reason?: string;
  }) {
    insertCostVoteStmt.run(
      params.userId,
      params.leagueId ?? null,
      params.seasonId ?? null,
      params.pokemonId,
      params.targetCost,
      params.reason ?? null
    );
  },

  /**
   * Aggregate votes for the balance dashboard.
   */
  getBalanceVoteAggregates(
    query: PokedexBalanceVotesQuery
  ): PokedexBalanceVoteItem[] {
    const { leagueId, seasonId, minVotes = 1 } = query;

    const filters: string[] = [];
    const params: Record<string, any> = {
      leagueId: leagueId ?? null,
      seasonId: seasonId ?? null,
      minVotes
    };

    if (leagueId != null) {
      filters.push("(v.league_id = @leagueId OR v.league_id IS NULL)");
    }
    if (seasonId != null) {
      filters.push("(v.season_id = @seasonId OR v.season_id IS NULL)");
    }

    const whereClause =
      filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";

    const sql = `
      SELECT
        e.id                AS pokemonId,
        e.name              AS name,
        e.dex_number        AS dexNumber,
        e.sprite_url        AS spriteUrl,
        e.base_cost         AS currentCost,
        COALESCE(o.is_banned, 0)       AS isBanned,
        SUM(CASE WHEN v.vote_type = 'ban' THEN 1 ELSE 0 END)   AS banVotes,
        SUM(CASE WHEN v.vote_type = 'unban' THEN 1 ELSE 0 END) AS unbanVotes,
        SUM(CASE WHEN v.vote_type = 'cost' THEN 1 ELSE 0 END)  AS costVoteCount,
        CASE
          WHEN SUM(CASE WHEN v.vote_type = 'cost' THEN 1 ELSE 0 END) > 0
          THEN AVG(CASE WHEN v.vote_type = 'cost' THEN v.target_cost ELSE NULL END)
          ELSE NULL
        END AS averageTargetCost
      FROM pokedex_votes v
      JOIN pokedex_entries e ON e.id = v.pokemon_id
      LEFT JOIN pokedex_season_overrides o
        ON o.pokemon_id = e.id
        AND (@seasonId IS NULL OR o.season_id = @seasonId)
        AND (@leagueId IS NULL OR o.league_id = @leagueId)
      ${whereClause}
      GROUP BY e.id
      HAVING (COUNT(*) >= @minVotes)
      ORDER BY banVotes DESC, costVoteCount DESC, e.name ASC
    `;

    const stmt = dbFile.prepare(sql);
    const rows = stmt.all(params) as {
      pokemonId: number;
      name: string;
      dexNumber: number | null;
      spriteUrl: string | null;
      currentCost: number | null;
      isBanned: number;
      banVotes: number;
      unbanVotes: number;
      costVoteCount: number;
      averageTargetCost: number | null;
    }[];

    return rows.map((r) => ({
      pokemonId: r.pokemonId,
      name: r.name,
      dexNumber: r.dexNumber,
      spriteUrl: r.spriteUrl,
      currentCost: r.currentCost,
      isBanned: !!r.isBanned,
      banVotes: r.banVotes,
      unbanVotes: r.unbanVotes,
      costVoteCount: r.costVoteCount,
      averageTargetCost: r.averageTargetCost
    }));
  }
};

/** Small JSON helpers – defensive against null/invalid stored data. */
function safeParseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function safeParseObject(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
