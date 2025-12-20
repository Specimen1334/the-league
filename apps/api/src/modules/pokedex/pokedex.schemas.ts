// apps/api/src/modules/pokedex/pokedex.schemas.ts

/**
 * Base Pokédex entry – global data, no season context.
 * This is basically the "truth" row from the importer.
 */
export type PokedexEntry = {
  pokemonId: number;
  dexNumber: number | null;
  name: string;
  formName: string | null;
  types: string[]; // e.g. ["Fire", "Flying"]
  roles: string[]; // e.g. ["Wallbreaker", "Sweeper"]
  baseCost: number | null;
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  } | null;
  tags: string[];
  spriteUrl: string | null;
};

/**
 * Season / league specific overlay for legality & cost.
 */
export type PokedexSeasonContext = {
  leagueId: number | null;
  seasonId: number | null;
  isBanned: boolean;
  effectiveCost: number | null; // override or base
  overrideCost: number | null;
};

/**
 * Query for GET /pokedex.
 * - Optional league/season context
 * - Basic search & filters
 * - Simple pagination
 */
export type PokedexBrowseQuery = {
  search?: string;
  type?: string;
  role?: string;
  ability?: string;
  move?: string;
  minCost?: number;
  maxCost?: number;
  /**
   * When true, restrict to Pokémon that are draftable by definition.
   * Per league rules: draftable iff base_cost is present.
   */
  draftableOnly?: boolean;
  leagueId?: number;
  seasonId?: number;
  sortBy?: "name" | "cost_low" | "cost_high" | "bst_high";
  legality?: "all" | "allowed" | "banned";
  page?: number;
  limit?: number;
};

export type PokedexBrowseItem = {
  pokemonId: number;
  name: string;
  formName: string | null;
  dexNumber: number | null;
  types: string[];
  roles: string[];
  spriteUrl: string | null;

  baseCost: number | null;
  effectiveCost: number | null;
  isBanned: boolean;

  bst: number | null;
};

export type PokedexBrowseResponse = {
  items: PokedexBrowseItem[];
  page: number;
  limit: number;
  total: number;
};

/**
 * Detail view for GET /pokedex/:pokemonId.
 * Season context is optional – route doesn’t require it,
 * but the client can infer or attach it separately later.
 */
export type PokedexDetailResponse = {
  entry: PokedexEntry;
  seasonContext?: PokedexSeasonContext;
  // later we can add usage stats, recent changes, etc.
};

/**
 * Body for POST /pokedex/:pokemonId/votes/ban
 */
export type PokedexBanVoteBody = {
  /**
   * League/season context for this vote.
   * At least one of leagueId or seasonId should be provided.
   */
  leagueId?: number;
  seasonId?: number;

  /** "ban" or "unban" for the context. */
  vote: "ban" | "unban";

  reason?: string;
};

/**
 * Body for POST /pokedex/:pokemonId/votes/cost
 */
export type PokedexCostVoteBody = {
  leagueId?: number;
  seasonId?: number;

  /** Desired new cost, e.g. 4 instead of 5. */
  targetCost: number;

  reason?: string;
};

/**
 * Query for GET /pokedex/balance-votes
 */
export type PokedexBalanceVotesQuery = {
  leagueId?: number;
  seasonId?: number;
  /**
   * Only show entries that have at least this many total votes
   * (ban+unban+cost). Defaults to 1.
   */
  minVotes?: number;
};

export type PokedexBalanceVoteItem = {
  pokemonId: number;
  name: string;
  dexNumber: number | null;
  spriteUrl: string | null;

  currentCost: number | null;
  isBanned: boolean;

  banVotes: number;
  unbanVotes: number;

  costVoteCount: number;
  averageTargetCost: number | null;
};

export type PokedexBalanceVotesResponse = {
  items: PokedexBalanceVoteItem[];
};
