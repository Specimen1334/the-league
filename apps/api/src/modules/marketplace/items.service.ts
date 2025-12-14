// apps/api/src/modules/marketplace/items.service.ts
import type { AppUser } from "../../shared/types";
import { dbFile } from "../../db/index";
import { seasonsRepo } from "../seasons/seasons.repo";
import { teamsRepo } from "../teams/teams.repo";
import { getLeagueRoleOrNull } from "../../shared/permissions";

import type {
  FreeAgentsListResponse,
  FreeAgentClaimBody,
  ProcessWaiversResponse,
  ShopItemsResponse,
  ShopPurchaseBody,
  ShopSellBody,
  MarketplaceSettingsResponse,
  MarketplaceSettingsUpdateBody,
  MarketplaceSettings,
  MarketplaceTransactionsResponse,
  TeamTransactionsResponse,
  MarketplaceTransaction,
  ShopItemView
} from "./items.schemas";

function assertPositiveInt(name: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${name} must be a positive integer`);
    (err as any).statusCode = 400;
    throw err;
  }
  return n;
}

function isCommissioner(user: AppUser, leagueId: number | null): boolean {
  if (user.role === "superadmin") return true;
  if (!leagueId) return false;
  const role = getLeagueRoleOrNull(leagueId, user.id);
  return role === "owner" || role === "commissioner";
}

const getTeamBalanceStmt = dbFile.prepare<[number]>(`SELECT balance FROM teams WHERE id = ?`);
const addTeamBalanceStmt = dbFile.prepare<[number, number]>(`UPDATE teams SET balance = balance + ? WHERE id = ?`);

const getTeamItemQtyStmt = dbFile.prepare<[number, number]>(`SELECT quantity FROM team_items WHERE team_id = ? AND item_id = ?`);
const upsertTeamItemDeltaStmt = dbFile.prepare<[number, number, number]>(`
  INSERT INTO team_items (team_id, item_id, quantity)
  VALUES (?, ?, ?)
  ON CONFLICT(team_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity
`);

const listShopItemsStmt = dbFile.prepare<[number]>(`
  SELECT
    si.item_id AS itemId,
    i.name AS name,
    i.category AS category,
    i.description AS description,
    si.price AS price,
    si.is_enabled AS isEnabled,
    i.sprite_url AS spriteUrl
  FROM season_items si
  JOIN items i ON i.id = si.item_id
  WHERE si.season_id = ?
  ORDER BY i.name ASC
`);

const listFreeAgentsStmt = dbFile.prepare<[number, number]>(`
  SELECT
    p.id AS pokemonId,
    p.name AS speciesName,
    COALESCE(so.override_cost, p.override_cost, p.base_cost) AS baseCost
  FROM pokedex_entries p
  LEFT JOIN pokedex_season_overrides so
    ON so.season_id = ? AND so.pokemon_id = p.id
  LEFT JOIN team_roster r
    ON r.pokemon_id = p.id
  LEFT JOIN teams t
    ON t.id = r.team_id AND t.season_id = ?
  WHERE (so.is_banned IS NULL OR so.is_banned = 0)
    AND t.id IS NULL
  ORDER BY p.name ASC
  LIMIT 300
`);

const getPokemonByIdStmt = dbFile.prepare<[number]>(`
  SELECT id AS pokemonId, name AS speciesName, COALESCE(override_cost, base_cost) AS baseCost
  FROM pokedex_entries
  WHERE id = ?
`);

const insertRosterRowStmt = dbFile.prepare<[number, number, string]>(`
  INSERT INTO team_roster (team_id, pokemon_id, species_name)
  VALUES (?, ?, ?)
  RETURNING id
`);

const setRosterInstanceIdStmt = dbFile.prepare<[number, number]>(`
  UPDATE team_roster
  SET pokemon_instance_id = ?
  WHERE id = ?
`);

const getSeasonSettingsRawStmt = dbFile.prepare<[number]>(`
  SELECT settings_json AS settingsJson
  FROM season_settings
  WHERE season_id = ?
`);

const upsertSeasonSettingsRawStmt = dbFile.prepare<[number, string]>(`
  INSERT INTO season_settings (season_id, settings_json)
  VALUES (?, ?)
  ON CONFLICT(season_id) DO UPDATE SET settings_json = excluded.settings_json
`);

const insertTxnStmt = dbFile.prepare<[number, number, string, string]>(`
  INSERT INTO marketplace_transactions (season_id, team_id, type, summary)
  VALUES (?, ?, ?, ?)
`);

const listSeasonTxnsStmt = dbFile.prepare<[number]>(`
  SELECT id, season_id AS seasonId, team_id AS teamId, type, summary, created_at AS createdAt
  FROM marketplace_transactions
  WHERE season_id = ?
  ORDER BY created_at DESC
  LIMIT 200
`);

const listTeamTxnsStmt = dbFile.prepare<[number, number]>(`
  SELECT id, season_id AS seasonId, team_id AS teamId, type, summary, created_at AS createdAt
  FROM marketplace_transactions
  WHERE season_id = ? AND team_id = ?
  ORDER BY created_at DESC
  LIMIT 200
`);

function getTeamBalance(teamId: number): number {
  const row = getTeamBalanceStmt.get(teamId) as any;
  return row ? Number(row.balance) || 0 : 0;
}

function adjustTeamBalance(teamId: number, delta: number) {
  addTeamBalanceStmt.run(delta, teamId);
}

function getTeamItemQty(teamId: number, itemId: number): number {
  const row = getTeamItemQtyStmt.get(teamId, itemId) as any;
  return row ? Number(row.quantity) || 0 : 0;
}

function adjustTeamItem(teamId: number, itemId: number, delta: number) {
  upsertTeamItemDeltaStmt.run(teamId, itemId, delta);
}

function loadSettings(seasonId: number): any {
  const row = getSeasonSettingsRawStmt.get(seasonId) as any;
  try {
    return row?.settingsJson ? JSON.parse(String(row.settingsJson)) : {};
  } catch {
    return {};
  }
}

function saveSettings(seasonId: number, obj: any) {
  upsertSeasonSettingsRawStmt.run(seasonId, JSON.stringify(obj ?? {}));
}

function coerceMarketplaceSettings(raw: any): MarketplaceSettings {
  const allowTrades = raw?.allowTrades !== undefined ? !!raw.allowTrades : true;
  const allowFreeAgency = raw?.allowFreeAgency !== undefined ? !!raw.allowFreeAgency : true;
  const allowShop = raw?.allowShop !== undefined ? !!raw.allowShop : true;
  return { allowTrades, allowFreeAgency, allowShop };
}

export const itemsService = {
  listShopItems(seasonIdParam: string, user: AppUser): ShopItemsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const settings = coerceMarketplaceSettings(loadSettings(seasonId));
    if (!settings.allowShop) {
      const err = new Error("Shop is disabled for this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const items = (listShopItemsStmt.all(seasonId) as any[]).map((r) => ({
      itemId: r.itemId,
      name: r.name,
      category: r.category ?? null,
      description: r.description ?? null,
      price: Number(r.price) || 0,
      isEnabled: !!r.isEnabled,
      spriteUrl: r.spriteUrl ?? null
    })) as ShopItemView[];

    return { seasonId, items };
  },

  purchaseItem(seasonIdParam: string, user: AppUser, body: ShopPurchaseBody) {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const itemId = assertPositiveInt("itemId", body.itemId);
    const qty = assertPositiveInt("quantity", body.quantity);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const settings = coerceMarketplaceSettings(loadSettings(seasonId));
    if (!settings.allowShop) {
      const err = new Error("Shop is disabled for this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const team = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!team) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const row = (listShopItemsStmt.all(seasonId) as any[]).find((r) => Number(r.itemId) === itemId);
    if (!row || !row.isEnabled) {
      const err = new Error("Item not available in this season shop");
      (err as any).statusCode = 404;
      throw err;
    }

    const price = Number(row.price) || 0;
    const total = price * qty;

    dbFile.transaction(() => {
      const balance = getTeamBalance(team.id);
      if (balance < total) {
        const err = new Error("Insufficient balance");
        (err as any).statusCode = 400;
        throw err;
      }

      adjustTeamBalance(team.id, -total);
      adjustTeamItem(team.id, itemId, qty);
      insertTxnStmt.run(seasonId, team.id, "purchase", `Purchased ${qty}x ${row.name} for ${total}`);
    })();
  },

  sellItem(seasonIdParam: string, user: AppUser, body: ShopSellBody) {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const itemId = assertPositiveInt("itemId", body.itemId);
    const qty = assertPositiveInt("quantity", body.quantity);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const settings = coerceMarketplaceSettings(loadSettings(seasonId));
    if (!settings.allowShop) {
      const err = new Error("Shop is disabled for this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const team = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!team) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const shopRow = (listShopItemsStmt.all(seasonId) as any[]).find((r) => Number(r.itemId) === itemId);
    const price = Number(shopRow?.price ?? 0);
    if (price <= 0) {
      const err = new Error("Item cannot be sold (no price defined)");
      (err as any).statusCode = 400;
      throw err;
    }

    dbFile.transaction(() => {
      const have = getTeamItemQty(team.id, itemId);
      if (have < qty) {
        const err = new Error("Not enough items to sell");
        (err as any).statusCode = 400;
        throw err;
      }

      adjustTeamItem(team.id, itemId, -qty);
      const total = price * qty;
      adjustTeamBalance(team.id, total);
      insertTxnStmt.run(seasonId, team.id, "sell", `Sold ${qty}x item#${itemId} for ${total}`);
    })();
  },

  listFreeAgents(seasonIdParam: string, user: AppUser): FreeAgentsListResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const settings = coerceMarketplaceSettings(loadSettings(seasonId));
    if (!settings.allowFreeAgency) {
      const err = new Error("Free agency is disabled for this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const rows = listFreeAgentsStmt.all(seasonId, seasonId) as any[];
    const items = rows.map((r) => ({
      pokemonId: Number(r.pokemonId),
      speciesName: String(r.speciesName),
      tier: null,
      baseCost: r.baseCost != null ? Number(r.baseCost) : null
    }));

    return { seasonId, items };
  },

  submitFreeAgentClaim(seasonIdParam: string, user: AppUser, body: FreeAgentClaimBody) {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const pokemonId = assertPositiveInt("pokemonId", body.pokemonId);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const settings = coerceMarketplaceSettings(loadSettings(seasonId));
    if (!settings.allowFreeAgency) {
      const err = new Error("Free agency is disabled for this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const team = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!team) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    // Minimal waivers implementation: immediate claim if unowned.
    const freeAgents = listFreeAgentsStmt.all(seasonId, seasonId) as any[];
    if (!freeAgents.some((r) => Number(r.pokemonId) === pokemonId)) {
      const err = new Error("Pokemon is not a free agent");
      (err as any).statusCode = 400;
      throw err;
    }

    const p = getPokemonByIdStmt.get(pokemonId) as any;
    if (!p) {
      const err = new Error("Pokemon not found");
      (err as any).statusCode = 404;
      throw err;
    }

    dbFile.transaction(() => {
      const idRow = insertRosterRowStmt.get(team.id, pokemonId, String(p.speciesName)) as any;
      const rosterId = Number(idRow?.id);
      setRosterInstanceIdStmt.run(rosterId, rosterId);

      insertTxnStmt.run(seasonId, team.id, "free_agent_claim", `Claimed ${p.speciesName}`);
    })();
  },

  processWaivers(seasonIdParam: string, user: AppUser): ProcessWaiversResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (!isCommissioner(user, season.leagueId ?? null)) {
      const err = new Error("Only commissioners can process waivers");
      (err as any).statusCode = 403;
      throw err;
    }

    // Current waivers model is immediate-claim; nothing to process.
    return { ok: true, processedClaims: 0, message: "Waivers are not queued in this build; claims process immediately." };
  },

  getMarketplaceSettings(seasonIdParam: string, user: AppUser): MarketplaceSettingsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const settings = coerceMarketplaceSettings(loadSettings(seasonId));
    return { seasonId, settings };
  },

  updateMarketplaceSettings(
    seasonIdParam: string,
    user: AppUser,
    body: MarketplaceSettingsUpdateBody
  ): MarketplaceSettingsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (!isCommissioner(user, season.leagueId ?? null)) {
      const err = new Error("Only commissioners can update marketplace settings");
      (err as any).statusCode = 403;
      throw err;
    }

    const currentRaw = loadSettings(seasonId);
    const merged = {
      ...currentRaw,
      ...body
    };

    saveSettings(seasonId, merged);

    return { seasonId, settings: coerceMarketplaceSettings(merged) };
  },

  listMarketplaceTransactions(seasonIdParam: string, user: AppUser): MarketplaceTransactionsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (!isCommissioner(user, season.leagueId ?? null)) {
      const err = new Error("Only commissioners can view full marketplace transactions");
      (err as any).statusCode = 403;
      throw err;
    }

    const rows = listSeasonTxnsStmt.all(seasonId) as any[];
    const items: MarketplaceTransaction[] = rows.map((r) => ({
      id: String(r.id),
      seasonId: r.seasonId,
      teamId: r.teamId,
      type: r.type,
      createdAt: r.createdAt,
      summary: r.summary
    }));

    return { seasonId, items };
  },

  listTeamTransactions(
    seasonIdParam: string,
    teamIdParam: string,
    user: AppUser
  ): TeamTransactionsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const teamId = assertPositiveInt("teamId", teamIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const viewerTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    const commissioner = isCommissioner(user, season.leagueId ?? null);

    if (!commissioner && (!viewerTeam || viewerTeam.id !== teamId)) {
      const err = new Error("You cannot view transactions for this team");
      (err as any).statusCode = 403;
      throw err;
    }

    const rows = listTeamTxnsStmt.all(seasonId, teamId) as any[];
    const items: MarketplaceTransaction[] = rows.map((r) => ({
      id: String(r.id),
      seasonId: r.seasonId,
      teamId: r.teamId,
      type: r.type,
      createdAt: r.createdAt,
      summary: r.summary
    }));

    return { seasonId, teamId, items };
  }
};
