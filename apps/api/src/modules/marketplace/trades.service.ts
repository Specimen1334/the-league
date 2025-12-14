// apps/api/src/modules/marketplace/trades.service.ts
import type { AppUser } from "../../shared/types";
import { dbFile } from "../../db/index";
import { seasonsRepo } from "../seasons/seasons.repo";
import { teamsRepo } from "../teams/teams.repo";
import { tradesRepo } from "./trades.repo";
import { itemsRepo } from "./items.repo";

import type {
  MarketplaceTeamsResponse,
  MarketplaceTeamRosterResponse,
  MarketplaceTeamSummary,
  TradeListQuery,
  TradeListResponse,
  TradeDetailResponse,
  TradeSummary,
  TradeAssetView,
  CreateTradeBody,
  TradeCounterBody,
  RejectTradeBody,
  TradeAssetType,
  TradeSide,
  TradeStatus
} from "./trades.schemas";

function assertPositiveInt(name: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${name} must be a positive integer`);
    (err as any).statusCode = 400;
    throw err;
  }
  return n;
}

function normaliseListQuery(
  raw: TradeListQuery
): Required<Pick<TradeListQuery, "page" | "limit">> & Omit<TradeListQuery, "page" | "limit"> {
  const page = Math.max(1, Number(raw.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(raw.limit) || 20));
  return { ...raw, page, limit };
}

const getRosterRowByInstanceStmt = dbFile.prepare<[number, number]>(`
  SELECT id, team_id AS teamId, pokemon_id AS pokemonId, pokemon_instance_id AS pokemonInstanceId, species_name AS speciesName, nickname
  FROM team_roster
  WHERE team_id = ? AND pokemon_instance_id = ?
`);

const transferRosterStmt = dbFile.prepare<[number, number]>(`
  UPDATE team_roster
  SET team_id = ?
  WHERE pokemon_instance_id = ?
`);

const getTeamBalanceStmt = dbFile.prepare<[number]>(`SELECT balance FROM teams WHERE id = ?`);
const addTeamBalanceStmt = dbFile.prepare<[number, number]>(`UPDATE teams SET balance = balance + ? WHERE id = ?`);

const upsertTeamItemDeltaStmt = dbFile.prepare<[number, number, number]>(`
  INSERT INTO team_items (team_id, item_id, quantity)
  VALUES (?, ?, ?)
  ON CONFLICT(team_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity
`);

const getTeamItemQtyStmt = dbFile.prepare<[number, number]>(`
  SELECT quantity FROM team_items WHERE team_id = ? AND item_id = ?
`);

function getTeamBalance(teamId: number): number {
  const row = getTeamBalanceStmt.get(teamId) as any;
  return row ? Number(row.balance) || 0 : 0;
}

function adjustTeamBalance(teamId: number, delta: number) {
  addTeamBalanceStmt.run(delta, teamId);
}

function adjustTeamItem(teamId: number, itemId: number, delta: number) {
  upsertTeamItemDeltaStmt.run(teamId, itemId, delta);
}

function getTeamItemQty(teamId: number, itemId: number): number {
  const row = getTeamItemQtyStmt.get(teamId, itemId) as any;
  return row ? Number(row.quantity) || 0 : 0;
}

function decorateAsset(row: any): TradeAssetView {
  if (row.assetType === "item") {
    const item = itemsRepo.getItemById(row.itemId ?? 0);
    return {
      id: row.id,
      side: row.side,
      assetType: "item",
      itemId: row.itemId ?? undefined,
      itemName: item?.name ?? null,
      itemCategory: item?.category ?? null,
      quantity: row.quantity ?? 0
    };
  }

  if (row.assetType === "pokemon") {
    // roster row may already have moved; keep minimal decoration
    return {
      id: row.id,
      side: row.side,
      assetType: "pokemon",
      pokemonInstanceId: row.pokemonInstanceId ?? undefined,
      pokemonId: row.pokemonId ?? undefined,
      pokemonName: row.speciesName ?? null,
      pokemonNickname: row.nickname ?? null
    };
  }

  return {
    id: row.id,
    side: row.side,
    assetType: "currency",
    currencyAmount: row.currencyAmount ?? 0
  };
}

function viewerPerspective(
  trade: { fromTeamId: number; toTeamId: number; status: TradeStatus },
  viewerTeamId: number | null
) {
  const isFrom = viewerTeamId != null && viewerTeamId === trade.fromTeamId;
  const isTo = viewerTeamId != null && viewerTeamId === trade.toTeamId;

  const direction: "incoming" | "outgoing" | "none" = isFrom ? "outgoing" : isTo ? "incoming" : "none";

  const canAccept = isTo && trade.status === "Pending";
  const canReject = isTo && trade.status === "Pending";
  const canCounter = isTo && (trade.status === "Pending" || trade.status === "Countered");
  const canCancel = isFrom && trade.status === "Pending";

  return { teamId: viewerTeamId, direction, canAccept, canReject, canCancel, canCounter };
}

export const tradesService = {
  listMarketplaceTeams(seasonIdParam: string, user: AppUser): MarketplaceTeamsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const teams = teamsRepo.listSeasonTeams(seasonId).filter((t) => t.userId !== null);
    const items: MarketplaceTeamSummary[] = teams.map((t) => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logoUrl
    }));

    return { seasonId, items };
  },

  getMarketplaceTeamRoster(
    seasonIdParam: string,
    teamIdParam: string,
    user: AppUser
  ): MarketplaceTeamRosterResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const teamId = assertPositiveInt("teamId", teamIdParam);

    const team = teamsRepo.getTeamBySeasonAndId(seasonId, teamId);
    if (!team) {
      const err = new Error("Team not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const roster = teamsRepo.listTeamRoster(team.id).map((r) => ({
      pokemonInstanceId: r.pokemonInstanceId,
      pokemonId: r.pokemonId,
      speciesName: r.speciesName,
      nickname: r.nickname
    }));

    return { seasonId, teamId: team.id, teamName: team.name, roster };
  },

  listTrades(seasonIdParam: string, user: AppUser, rawQuery: TradeListQuery): TradeListResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const query = normaliseListQuery(rawQuery);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const userTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!userTeam) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const all = tradesRepo.listTradesForSeasonAndTeam(seasonId, userTeam.id);

    const directionFilter = query.direction ?? "all";
    const statusFilter = query.status ?? "Any";

    const filtered = all.filter((t) => {
      const dir = t.fromTeamId === userTeam.id ? "outgoing" : "incoming";
      if (directionFilter !== "all" && dir !== directionFilter) return false;
      if (statusFilter !== "Any" && t.status !== statusFilter) return false;
      return true;
    });

    const total = filtered.length;
    const start = (query.page - 1) * query.limit;
    const pageTrades = filtered.slice(start, start + query.limit);

    const items: TradeSummary[] = pageTrades.map((t) => {
      const fromTeam = teamsRepo.getTeamById(t.fromTeamId);
      const toTeam = teamsRepo.getTeamById(t.toTeamId);
      return {
        id: t.id,
        seasonId: t.seasonId,
        fromTeamId: t.fromTeamId,
        toTeamId: t.toTeamId,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        expiresAt: t.expiresAt,
        direction: t.fromTeamId === userTeam.id ? "outgoing" : "incoming",
        fromTeamName: fromTeam?.name ?? null,
        toTeamName: toTeam?.name ?? null
      };
    });

    return { page: query.page, limit: query.limit, total, items };
  },

  getTrade(seasonIdParam: string, tradeIdParam: string, user: AppUser): TradeDetailResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const tradeId = assertPositiveInt("tradeId", tradeIdParam);

    const trade = tradesRepo.getTradeById(tradeId);
    if (!trade || trade.seasonId !== seasonId) {
      const err = new Error("Trade not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const viewerTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!viewerTeam || (viewerTeam.id !== trade.fromTeamId && viewerTeam.id !== trade.toTeamId)) {
      const err = new Error("You cannot view this trade");
      (err as any).statusCode = 403;
      throw err;
    }

    const fromTeam = teamsRepo.getTeamById(trade.fromTeamId);
    const toTeam = teamsRepo.getTeamById(trade.toTeamId);

    const assets = tradesRepo.listAssetsForTrade(trade.id).map((a) => decorateAsset(a));

    return {
      trade: {
        id: trade.id,
        seasonId: trade.seasonId,
        fromTeamId: trade.fromTeamId,
        toTeamId: trade.toTeamId,
        status: trade.status,
        createdAt: trade.createdAt,
        updatedAt: trade.updatedAt,
        expiresAt: trade.expiresAt,
        message: trade.message
      },
      fromTeam: { id: trade.fromTeamId, name: fromTeam?.name ?? null },
      toTeam: { id: trade.toTeamId, name: toTeam?.name ?? null },
      assets,
      viewerPerspective: viewerPerspective(trade, viewerTeam?.id ?? null)
    };
  },

  createTrade(seasonIdParam: string, user: AppUser, body: CreateTradeBody): TradeDetailResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const fromTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!fromTeam) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const toTeamId = assertPositiveInt("toTeamId", body.toTeamId);
    if (toTeamId === fromTeam.id) {
      const err = new Error("Cannot trade with yourself");
      (err as any).statusCode = 400;
      throw err;
    }

    const toTeam = teamsRepo.getTeamBySeasonAndId(seasonId, toTeamId);
    if (!toTeam) {
      const err = new Error("Target team not found in this season");
      (err as any).statusCode = 404;
      throw err;
    }

    // Validate assets
    validateAssetSet(fromTeam.id, body.assetsFromMe ?? [], "from");
    validateAssetSet(toTeam.id, body.assetsFromThem ?? [], "to");

    const trade = tradesRepo.createTrade({
      seasonId,
      fromTeamId: fromTeam.id,
      toTeamId: toTeam.id,
      status: "Pending",
      message: (body.message ?? null) as any,
      expiresAt: body.expiresAt ?? null
    });

    const rows = [
      ...mapAssetInputs(trade.id, "from", body.assetsFromMe ?? []),
      ...mapAssetInputs(trade.id, "to", body.assetsFromThem ?? [])
    ];

    tradesRepo.replaceTradeAssets(trade.id, rows);

    return this.getTrade(seasonIdParam, String(trade.id), user);
  },

  acceptTrade(seasonIdParam: string, tradeIdParam: string, user: AppUser): TradeDetailResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const tradeId = assertPositiveInt("tradeId", tradeIdParam);

    const trade = tradesRepo.getTradeById(tradeId);
    if (!trade || trade.seasonId !== seasonId) {
      const err = new Error("Trade not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (trade.status !== "Pending") {
      const err = new Error("Trade is not pending");
      (err as any).statusCode = 409;
      throw err;
    }

    const viewerTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!viewerTeam || viewerTeam.id !== trade.toTeamId) {
      const err = new Error("Only the receiving team can accept this trade");
      (err as any).statusCode = 403;
      throw err;
    }

    const assets = tradesRepo.listAssetsForTrade(trade.id);

    // Re-validate ownership at time of accept.
    validateTradeAssetsOwnership(trade.fromTeamId, trade.toTeamId, assets);

    dbFile.transaction(() => {
      // Apply transfers
      for (const a of assets) {
        const fromTeamId = a.side === "from" ? trade.fromTeamId : trade.toTeamId;
        const toTeamId = a.side === "from" ? trade.toTeamId : trade.fromTeamId;

        if (a.assetType === "pokemon") {
          if (!a.pokemonInstanceId) throwBadRequest("pokemonInstanceId required");
          const rosterRow = getRosterRowByInstanceStmt.get(fromTeamId, a.pokemonInstanceId) as any;
          if (!rosterRow) throwBadRequest("Pokemon not found on source team");
          transferRosterStmt.run(toTeamId, a.pokemonInstanceId);
        } else if (a.assetType === "item") {
          if (!a.itemId) throwBadRequest("itemId required");
          const qty = Number(a.quantity ?? 0);
          if (!Number.isInteger(qty) || qty <= 0) throwBadRequest("quantity must be positive");
          const have = getTeamItemQty(fromTeamId, a.itemId);
          if (have < qty) throwBadRequest("Source team does not have enough items");
          adjustTeamItem(fromTeamId, a.itemId, -qty);
          adjustTeamItem(toTeamId, a.itemId, qty);
        } else if (a.assetType === "currency") {
          const amount = Number(a.currencyAmount ?? 0);
          if (!Number.isInteger(amount) || amount <= 0) throwBadRequest("currencyAmount must be positive");
          const have = getTeamBalance(fromTeamId);
          if (have < amount) throwBadRequest("Source team does not have enough balance");
          adjustTeamBalance(fromTeamId, -amount);
          adjustTeamBalance(toTeamId, amount);
        }
      }

      tradesRepo.updateTradeStatus(trade.id, "Accepted");
    })();

    return this.getTrade(seasonIdParam, tradeIdParam, user);
  },

  rejectTrade(
    seasonIdParam: string,
    tradeIdParam: string,
    user: AppUser,
    body: RejectTradeBody
  ): TradeDetailResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const tradeId = assertPositiveInt("tradeId", tradeIdParam);

    const trade = tradesRepo.getTradeById(tradeId);
    if (!trade || trade.seasonId !== seasonId) {
      const err = new Error("Trade not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (trade.status !== "Pending" && trade.status !== "Countered") {
      const err = new Error("Trade cannot be rejected in its current state");
      (err as any).statusCode = 409;
      throw err;
    }

    const viewerTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!viewerTeam || viewerTeam.id !== trade.toTeamId) {
      const err = new Error("Only the receiving team can reject this trade");
      (err as any).statusCode = 403;
      throw err;
    }

    tradesRepo.updateTradeStatus(trade.id, "Rejected");
    return this.getTrade(seasonIdParam, tradeIdParam, user);
  },

  counterTrade(
    seasonIdParam: string,
    tradeIdParam: string,
    user: AppUser,
    body: TradeCounterBody
  ): TradeDetailResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const tradeId = assertPositiveInt("tradeId", tradeIdParam);

    const trade = tradesRepo.getTradeById(tradeId);
    if (!trade || trade.seasonId !== seasonId) {
      const err = new Error("Trade not found");
      (err as any).statusCode = 404;
      throw err;
    }

    if (trade.status !== "Pending" && trade.status !== "Countered") {
      const err = new Error("Trade cannot be countered in its current state");
      (err as any).statusCode = 409;
      throw err;
    }

    const viewerTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!viewerTeam || viewerTeam.id !== trade.toTeamId) {
      const err = new Error("Only the receiving team can counter this trade");
      (err as any).statusCode = 403;
      throw err;
    }

    validateAssetSet(trade.fromTeamId, body.assetsFromMe ?? [], "from");
    validateAssetSet(trade.toTeamId, body.assetsFromThem ?? [], "to");

    const rows = [
      ...mapAssetInputs(trade.id, "from", body.assetsFromMe ?? []),
      ...mapAssetInputs(trade.id, "to", body.assetsFromThem ?? [])
    ];

    tradesRepo.replaceTradeAssets(trade.id, rows);
    tradesRepo.updateTradeForCounter({
      tradeId: trade.id,
      status: "Countered",
      message: body.message ?? "",
      expiresAt: body.expiresAt ?? null
    });

    return this.getTrade(seasonIdParam, tradeIdParam, user);
  }
};

function throwBadRequest(msg: string): never {
  const err = new Error(msg);
  (err as any).statusCode = 400;
  throw err;
}

function mapAssetInputs(tradeId: number, side: TradeSide, assets: any[]) {
  return assets.map((a) => {
    const type = a.assetType as TradeAssetType;
    if (type === "pokemon") {
      const inst = assertPositiveInt("assetKey", a.assetKey);
      return { side, assetType: "pokemon" as const, pokemonInstanceId: inst };
    }
    if (type === "item") {
      const itemId = assertPositiveInt("assetKey", a.assetKey);
      const qty = assertPositiveInt("quantity", a.quantity);
      return { side, assetType: "item" as const, itemId, quantity: qty };
    }
    if (type === "currency") {
      const amt = assertPositiveInt("quantity", a.quantity);
      return { side, assetType: "currency" as const, currencyAmount: amt };
    }
    throwBadRequest("Unsupported assetType");
  });
}

function validateAssetSet(teamId: number, assets: any[], sideLabel: string) {
  for (const a of assets) {
    const type = a.assetType as TradeAssetType;
    if (type === "pokemon") {
      const inst = assertPositiveInt("assetKey", a.assetKey);
      const row = getRosterRowByInstanceStmt.get(teamId, inst) as any;
      if (!row) throwBadRequest(`Pokemon instance ${inst} not found on ${sideLabel} team`);
    } else if (type === "item") {
      const itemId = assertPositiveInt("assetKey", a.assetKey);
      const qty = assertPositiveInt("quantity", a.quantity);
      const have = getTeamItemQty(teamId, itemId);
      if (have < qty) throwBadRequest(`Team does not have enough of item ${itemId}`);
    } else if (type === "currency") {
      const amt = assertPositiveInt("quantity", a.quantity);
      const have = getTeamBalance(teamId);
      if (have < amt) throwBadRequest("Team does not have enough balance");
    } else {
      throwBadRequest("Unsupported assetType");
    }
  }
}

function validateTradeAssetsOwnership(fromTeamId: number, toTeamId: number, assets: any[]) {
  for (const a of assets) {
    const src = a.side === "from" ? fromTeamId : toTeamId;
    if (a.assetType === "pokemon") {
      if (!a.pokemonInstanceId) throwBadRequest("pokemonInstanceId required");
      const row = getRosterRowByInstanceStmt.get(src, a.pokemonInstanceId) as any;
      if (!row) throwBadRequest("Pokemon no longer owned by source team");
    } else if (a.assetType === "item") {
      if (!a.itemId) throwBadRequest("itemId required");
      const qty = Number(a.quantity ?? 0);
      if (getTeamItemQty(src, a.itemId) < qty) throwBadRequest("Item no longer available on source team");
    } else if (a.assetType === "currency") {
      const amt = Number(a.currencyAmount ?? 0);
      if (getTeamBalance(src) < amt) throwBadRequest("Balance no longer available on source team");
    }
  }
}
