// apps/api/src/modules/marketplace/trades.schemas.ts

/**
 * Trade lifecycle.
 */
export type TradeStatus =
  | "Pending"
  | "Accepted"
  | "Rejected"
  | "Cancelled"
  | "Countered";

/**
 * Which side is offering a given asset – from the perspective of the
 * original trade offer.
 */
export type TradeSide = "from" | "to";

/**
 * What kind of asset is involved in the trade.
 */
export type TradeAssetType = "pokemon" | "item" | "currency";

export type TradeAssetInput = {
  assetType: TradeAssetType;
  assetKey: string; // pokemon_instance_id, item_id, or "balance"
  quantity?: number; // required for item/currency
};

/**
 * Create trade body (spine).
 */
export type CreateTradeBody = {
  toTeamId: number;
  assetsFromMe: TradeAssetInput[];
  assetsFromThem: TradeAssetInput[];
  message?: string | null;
  expiresAt?: string | null;
};

export type TradeCounterBody = {
  assetsFromMe: TradeAssetInput[];
  assetsFromThem: TradeAssetInput[];
  message?: string | null;
  expiresAt?: string | null;
};

export type RejectTradeBody = {
  reason?: string | null;
};

export type TradeListQuery = {
  direction?: "incoming" | "outgoing" | "all";
  status?: TradeStatus | "Any";
  page?: number;
  limit?: number;
};

export type MarketplaceTeamSummary = {
  id: number;
  name: string;
  logoUrl: string | null;
};

export type MarketplaceTeamsResponse = {
  seasonId: number;
  items: MarketplaceTeamSummary[];
};

export type MarketplaceRosterEntry = {
  pokemonInstanceId: number;
  pokemonId: number;
  speciesName: string | null;
  nickname: string | null;
};

export type MarketplaceTeamRosterResponse = {
  seasonId: number;
  teamId: number;
  teamName: string;
  roster: MarketplaceRosterEntry[];
};

export type TradeAssetView = {
  id: number;
  side: TradeSide;
  assetType: TradeAssetType;

  pokemonInstanceId?: number;
  pokemonId?: number;
  pokemonName?: string | null;
  pokemonNickname?: string | null;

  itemId?: number;
  itemName?: string | null;
  itemCategory?: string | null;
  quantity?: number;

  currencyAmount?: number;
};

export type TradeSummary = {
  id: number;
  seasonId: number;
  fromTeamId: number;
  toTeamId: number;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;

  direction: "incoming" | "outgoing";

  fromTeamName: string | null;
  toTeamName: string | null;
};

export type TradeListResponse = {
  page: number;
  limit: number;
  total: number;
  items: TradeSummary[];
};

export type TradeDetailResponse = {
  trade: {
    id: number;
    seasonId: number;
    fromTeamId: number;
    toTeamId: number;
    status: TradeStatus;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
    message: string | null;
  };

  fromTeam: { id: number; name: string | null };
  toTeam: { id: number; name: string | null };

  assets: TradeAssetView[];
  viewerPerspective: {
    teamId: number | null;
    direction: "incoming" | "outgoing" | "none";
    canAccept: boolean;
    canReject: boolean;
    canCancel: boolean;
    canCounter: boolean;
  };
};

/* -------------------------------------------------------------------------- */
/* Legacy aliases (kept to avoid breaking older imports during Pass #1)        */
/* -------------------------------------------------------------------------- */

export type TradeCreateBody = CreateTradeBody;
