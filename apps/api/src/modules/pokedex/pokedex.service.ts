// apps/api/src/modules/pokedex/pokedex.service.ts
import type { AppUser } from "../../shared/types";
import { pokedexRepo } from "./pokedex.repo";
import type {
  PokedexBrowseQuery,
  PokedexBrowseResponse,
  PokedexDetailResponse,
  PokedexBanVoteBody,
  PokedexCostVoteBody,
  PokedexBalanceVotesQuery,
  PokedexBalanceVotesResponse
} from "./pokedex.schemas";

function normaliseBrowseQuery(
  raw: PokedexBrowseQuery
): Required<Pick<PokedexBrowseQuery, "page" | "limit">> &
  Omit<PokedexBrowseQuery, "page" | "limit"> {
  const page = Math.max(1, Number(raw.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(raw.limit) || 50));
  return {
    ...raw,
    page,
    limit
  };
}

export const pokedexService = {
  /**
   * Browse endpoint: GET /pokedex
   */
  browsePokedex(
    user: AppUser,
    rawQuery: PokedexBrowseQuery
  ): PokedexBrowseResponse {
    const query = normaliseBrowseQuery(rawQuery);

    const { rows, total } = pokedexRepo.browseEntries(query);

    const items = rows.map((row) => {
      const types = safeParseArray(row.types_json);
      const roles = safeParseArray(row.roles_json);

      const baseCost = row.base_cost;
      const overrideCost = row.override_cost;
      const effectiveCost = overrideCost ?? baseCost ?? null;
      const isBanned = !!row.is_banned;

      return {
        pokemonId: row.id,
        name: row.name,
        formName: row.form_name,
        dexNumber: row.dex_number,
        types,
        roles,
        spriteUrl: row.sprite_url,
        baseCost,
        effectiveCost,
        isBanned
      };
    });

    return {
      items,
      page: query.page,
      limit: query.limit,
      total
    };
  },

  /**
   * Detail endpoint: GET /pokedex/:pokemonId
   */
  getPokemonDetail(
    user: AppUser,
    pokemonIdParam: string
  ): PokedexDetailResponse {
    const pokemonId = Number(pokemonIdParam);
    if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
      const err = new Error("Invalid pokemonId");
      (err as any).statusCode = 400;
      throw err;
    }

    const entry = pokedexRepo.getEntryById(pokemonId);
    if (!entry) {
      const err = new Error("Pokémon not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // For now we don’t infer league/season from user; callers that care
    // about a specific season can use /pokedex/balance-votes or a
    // separate season overlay. We still return a "null context".
    const seasonContext = {
      leagueId: null,
      seasonId: null,
      isBanned: false,
      effectiveCost: entry.baseCost,
      overrideCost: null
    };

    return {
      entry,
      seasonContext
    };
  },

  /**
   * POST /pokedex/:pokemonId/votes/ban
   */
  voteBan(
    user: AppUser,
    pokemonIdParam: string,
    body: PokedexBanVoteBody
  ): PokedexDetailResponse {
    const pokemonId = Number(pokemonIdParam);
    if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
      const err = new Error("Invalid pokemonId");
      (err as any).statusCode = 400;
      throw err;
    }

    if (body.vote !== "ban" && body.vote !== "unban") {
      const err = new Error("vote must be 'ban' or 'unban'");
      (err as any).statusCode = 400;
      throw err;
    }

    // Ensure the Pokémon exists
    const entry = pokedexRepo.getEntryById(pokemonId);
    if (!entry) {
      const err = new Error("Pokémon not found");
      (err as any).statusCode = 404;
      throw err;
    }

    pokedexRepo.insertBanVote({
      userId: user.id,
      leagueId: body.leagueId,
      seasonId: body.seasonId,
      pokemonId,
      vote: body.vote,
      reason: body.reason
    });

    // Return latest detail (no live tally) – clients can hit
    // /pokedex/balance-votes to see aggregates.
    return this.getPokemonDetail(user, String(pokemonId));
  },

  /**
   * POST /pokedex/:pokemonId/votes/cost
   */
  voteCost(
    user: AppUser,
    pokemonIdParam: string,
    body: PokedexCostVoteBody
  ): PokedexDetailResponse {
    const pokemonId = Number(pokemonIdParam);
    if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
      const err = new Error("Invalid pokemonId");
      (err as any).statusCode = 400;
      throw err;
    }

    if (!Number.isInteger(body.targetCost) || body.targetCost <= 0) {
      const err = new Error("targetCost must be a positive integer");
      (err as any).statusCode = 400;
      throw err;
    }

    const entry = pokedexRepo.getEntryById(pokemonId);
    if (!entry) {
      const err = new Error("Pokémon not found");
      (err as any).statusCode = 404;
      throw err;
    }

    pokedexRepo.insertCostVote({
      userId: user.id,
      leagueId: body.leagueId,
      seasonId: body.seasonId,
      pokemonId,
      targetCost: body.targetCost,
      reason: body.reason
    });

    return this.getPokemonDetail(user, String(pokemonId));
  },

  /**
   * GET /pokedex/balance-votes
   */
  getBalanceVotes(
    user: AppUser,
    query: PokedexBalanceVotesQuery
  ): PokedexBalanceVotesResponse {
    const items = pokedexRepo.getBalanceVoteAggregates(query);
    return { items };
  }
};

/** JSON helpers – duplicate of repo ones but scoped here for row shape. */
function safeParseArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
