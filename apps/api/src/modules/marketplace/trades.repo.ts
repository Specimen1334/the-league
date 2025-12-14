// apps/api/src/modules/marketplace/trades.repo.ts
import { dbFile } from "../../db/index";
import type {
  TradeStatus,
  TradeSide,
  TradeAssetType
} from "./trades.schemas";

/**
 * Expected tables (for reference):
 *
 * trades
 *  - id INTEGER PRIMARY KEY
 *  - season_id INTEGER NOT NULL
 *  - from_team_id INTEGER NOT NULL
 *  - to_team_id INTEGER NOT NULL
 *  - status TEXT NOT NULL
 *  - message TEXT
 *  - created_at TEXT NOT NULL DEFAULT (datetime('now'))
 *  - updated_at TEXT NOT NULL DEFAULT (datetime('now'))
 *  - last_message_at TEXT
 *  - expires_at TEXT
 *
 * trade_assets
 *  - id INTEGER PRIMARY KEY
 *  - trade_id INTEGER NOT NULL
 *  - side TEXT NOT NULL            -- 'from' | 'to'
 *  - asset_type TEXT NOT NULL      -- 'Pokemon' | 'Item' | 'Currency'
 *  - pokemon_instance_id INTEGER
 *  - item_id INTEGER
 *  - quantity INTEGER
 *  - currency_amount INTEGER
 */

export type TradeRow = {
  id: number;
  seasonId: number;
  fromTeamId: number;
  toTeamId: number;
  status: TradeStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  expiresAt: string | null;
};

export type TradeAssetRow = {
  id: number;
  tradeId: number;
  side: TradeSide;
  assetType: TradeAssetType;
  pokemonInstanceId: number | null;
  itemId: number | null;
  quantity: number | null;
  currencyAmount: number | null;
};

const selectTradeBase = `
  SELECT
    id,
    season_id      AS seasonId,
    from_team_id   AS fromTeamId,
    to_team_id     AS toTeamId,
    status         AS status,
    message        AS message,
    created_at     AS createdAt,
    updated_at     AS updatedAt,
    last_message_at AS lastMessageAt,
    expires_at     AS expiresAt
  FROM trades
`;

const getTradeByIdStmt = dbFile.prepare<[number]>(`
  ${selectTradeBase}
  WHERE id = ?
`);

const listTradesForSeasonAndTeamStmt = dbFile.prepare<
  [number, number]
>(`
  ${selectTradeBase}
  WHERE season_id = ?
    AND (from_team_id = ? OR to_team_id = ?)
  ORDER BY created_at DESC
`);

const insertTradeStmt = dbFile.prepare<
  [number, number, number, string, string | null, string | null]
>(`
  INSERT INTO trades (
    season_id,
    from_team_id,
    to_team_id,
    status,
    message,
    expires_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    season_id      AS seasonId,
    from_team_id   AS fromTeamId,
    to_team_id     AS toTeamId,
    status         AS status,
    message        AS message,
    created_at     AS createdAt,
    updated_at     AS updatedAt,
    last_message_at AS lastMessageAt,
    expires_at     AS expiresAt
`);

const updateTradeStatusStmt = dbFile.prepare<
  [string, number]
>(`
  UPDATE trades
  SET status = ?, updated_at = datetime('now')
  WHERE id = ?
  RETURNING
    id,
    season_id      AS seasonId,
    from_team_id   AS fromTeamId,
    to_team_id     AS toTeamId,
    status         AS status,
    message        AS message,
    created_at     AS createdAt,
    updated_at     AS updatedAt,
    last_message_at AS lastMessageAt,
    expires_at     AS expiresAt
`);

const updateTradeForCounterStmt = dbFile.prepare<
  [string, string, string | null, number]
>(`
  UPDATE trades
  SET
    status = ?,
    message = ?,
    expires_at = ?,
    updated_at = datetime('now')
  WHERE id = ?
  RETURNING
    id,
    season_id      AS seasonId,
    from_team_id   AS fromTeamId,
    to_team_id     AS toTeamId,
    status         AS status,
    message        AS message,
    created_at     AS createdAt,
    updated_at     AS updatedAt,
    last_message_at AS lastMessageAt,
    expires_at     AS expiresAt
`);

const deleteTradeAssetsStmt = dbFile.prepare<[number]>(`
  DELETE FROM trade_assets
  WHERE trade_id = ?
`);

const insertTradeAssetStmt = dbFile.prepare<
  [
    number,
    string,
    string,
    number | null,
    number | null,
    number | null,
    number | null
  ]
>(`
  INSERT INTO trade_assets (
    trade_id,
    side,
    asset_type,
    pokemon_instance_id,
    item_id,
    quantity,
    currency_amount
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  RETURNING
    id,
    trade_id          AS tradeId,
    side              AS side,
    asset_type        AS assetType,
    pokemon_instance_id AS pokemonInstanceId,
    item_id           AS itemId,
    quantity          AS quantity,
    currency_amount   AS currencyAmount
`);

const listAssetsForTradeStmt = dbFile.prepare<[number]>(`
  SELECT
    id,
    trade_id          AS tradeId,
    side,
    asset_type        AS assetType,
    pokemon_instance_id AS pokemonInstanceId,
    item_id           AS itemId,
    quantity          AS quantity,
    currency_amount   AS currencyAmount
  FROM trade_assets
  WHERE trade_id = ?
  ORDER BY id ASC
`);

export const tradesRepo = {
  getTradeById(tradeId: number): TradeRow | undefined {
    return getTradeByIdStmt.get(tradeId) as TradeRow | undefined;
  },

  listTradesForSeasonAndTeam(
    seasonId: number,
    teamId: number
  ): TradeRow[] {
    return listTradesForSeasonAndTeamStmt.all(
      seasonId,
      teamId,
      teamId
    ) as TradeRow[];
  },

  createTrade(params: {
    seasonId: number;
    fromTeamId: number;
    toTeamId: number;
    status: TradeStatus;
    message: string | null;
    expiresAt: string | null;
  }): TradeRow {
    return insertTradeStmt.get(
      params.seasonId,
      params.fromTeamId,
      params.toTeamId,
      params.status,
      params.message,
      params.expiresAt
    ) as TradeRow;
  },

  updateTradeStatus(
    tradeId: number,
    status: TradeStatus
  ): TradeRow | undefined {
    return updateTradeStatusStmt.get(status, tradeId) as TradeRow | undefined;
  },

  updateTradeForCounter(params: {
    tradeId: number;
    status: TradeStatus;
    message: string;
    expiresAt: string | null;
  }): TradeRow | undefined {
    return updateTradeForCounterStmt.get(
      params.status,
      params.message,
      params.expiresAt,
      params.tradeId
    ) as TradeRow | undefined;
  },

  replaceTradeAssets(
    tradeId: number,
    assets: {
      side: TradeSide;
      assetType: TradeAssetType;
      pokemonInstanceId?: number | null;
      itemId?: number | null;
      quantity?: number | null;
      currencyAmount?: number | null;
    }[]
  ): TradeAssetRow[] {
    deleteTradeAssetsStmt.run(tradeId);

    const rows: TradeAssetRow[] = [];
    for (const a of assets) {
      const row = insertTradeAssetStmt.get(
        tradeId,
        a.side,
        a.assetType,
        a.pokemonInstanceId ?? null,
        a.itemId ?? null,
        a.quantity ?? null,
        a.currencyAmount ?? null
      ) as TradeAssetRow;
      rows.push(row);
    }
    return rows;
  },

  listAssetsForTrade(tradeId: number): TradeAssetRow[] {
    return listAssetsForTradeStmt.all(tradeId) as TradeAssetRow[];
  }
};
