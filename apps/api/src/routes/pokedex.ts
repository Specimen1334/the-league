// apps/api/src/routes/pokedex.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions";
import { toErrorResponse } from "../shared/errors";
import { pokedexService } from "../modules/pokedex/pokedex.service";

import type {
  PokedexBrowseQuery,
  PokedexBrowseResponse,
  PokedexDetailResponse,
  PokedexBalanceVotesQuery,
  PokedexBalanceVotesResponse,
  PokedexBanVoteBody,
  PokedexCostVoteBody
} from "../modules/pokedex/pokedex.schemas";

export function registerPokedexRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // ───────────────────────────
  // Browse
  // ───────────────────────────

  // GET /pokedex
  app.get<{
    Querystring: PokedexBrowseQuery;
    Reply: PokedexBrowseResponse;
  }>(
    "/pokedex",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = pokedexService.browsePokedex(
          user,
          request.query ?? {}
        );
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // GET /pokedex/:pokemonId
  app.get<{
    Params: { pokemonId: string };
    Reply: PokedexDetailResponse;
  }>(
    "/pokedex/:pokemonId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        // Treat pokemonId as opaque string; service can parse (numeric/species/etc)
        const { pokemonId } = request.params;
        const user = request.user!;
        const detail = pokedexService.getPokemonDetail(user, pokemonId);
        reply.send(detail);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Voting
  // ───────────────────────────

  // POST /pokedex/:pokemonId/votes/ban
  app.post<{
    Params: { pokemonId: string };
    Body: PokedexBanVoteBody;
    Reply: PokedexDetailResponse;
  }>(
    "/pokedex/:pokemonId/votes/ban",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { pokemonId } = request.params;
        const user = request.user!;
        const updated = pokedexService.voteBan(
          user,
          pokemonId,
          request.body
        );
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // POST /pokedex/:pokemonId/votes/cost
  app.post<{
    Params: { pokemonId: string };
    Body: PokedexCostVoteBody;
    Reply: PokedexDetailResponse;
  }>(
    "/pokedex/:pokemonId/votes/cost",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { pokemonId } = request.params;
        const user = request.user!;
        const updated = pokedexService.voteCost(
          user,
          pokemonId,
          request.body
        );
        reply.send(updated);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Balance dashboard
  // ───────────────────────────

  // GET /pokedex/balance-votes
  app.get<{
    Querystring: PokedexBalanceVotesQuery;
    Reply: PokedexBalanceVotesResponse;
  }>(
    "/pokedex/balance-votes",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = pokedexService.getBalanceVotes(
          user,
          request.query ?? {}
        );
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
