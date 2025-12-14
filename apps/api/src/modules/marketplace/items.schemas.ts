// apps/api/src/modules/marketplace/items.schemas.ts

export type FreeAgentView = {
  pokemonId: number;
  speciesName: string;
  tier: string | null;
  baseCost: number | null;
};

export type FreeAgentsListResponse = {
  seasonId: number;
  items: FreeAgentView[];
};

export type FreeAgentClaimBody = {
  pokemonId: number;
};

export type ProcessWaiversResponse = {
  ok: boolean;
  processedClaims: number;
  message: string | null;
};

export type ShopItemView = {
  itemId: number;
  name: string;
  category: string | null;
  description: string | null;
  price: number;
  isEnabled: boolean;
  spriteUrl: string | null;
};

export type ShopItemsResponse = {
  seasonId: number;
  items: ShopItemView[];
};

export type ShopPurchaseBody = {
  itemId: number;
  quantity: number;
};

export type ShopSellBody = {
  itemId: number;
  quantity: number;
};

export type MarketplaceSettings = {
  allowTrades: boolean;
  allowFreeAgency: boolean;
  allowShop: boolean;
};

export type MarketplaceSettingsPatch = Partial<MarketplaceSettings>;

export type MarketplaceSettingsResponse = {
  seasonId: number;
  settings: MarketplaceSettings;
};

export type MarketplaceSettingsUpdateBody = MarketplaceSettingsPatch;

export type MarketplaceTransaction = {
  id: string;
  seasonId: number;
  teamId: number;
  type: "purchase" | "sell" | "free_agent_claim" | "trade";
  createdAt: string;
  summary: string;
};

export type MarketplaceTransactionsResponse = {
  seasonId: number;
  items: MarketplaceTransaction[];
};

export type TeamTransactionsResponse = {
  seasonId: number;
  teamId: number;
  items: MarketplaceTransaction[];
};
