// apps/api/src/routes/marketplace.ts
import type { FastifyInstance } from "fastify";
import type { RequireAuthHook } from "../shared/permissions.";
import { toErrorResponse } from "../shared/errors";

import { tradesService } from "../modules/marketplace/trades.service";
import { itemsService } from "../modules/marketplace/items.service";

import type {
  MarketplaceTeamRosterResponse,
  MarketplaceTeamsResponse,
  CreateTradeBody,
  TradeCounterBody,
  TradeListQuery,
  TradeListResponse,
  TradeDetailResponse,
  RejectTradeBody
} from "../modules/marketplace/trades.schemas";

import type {
  FreeAgentsListResponse,
  FreeAgentClaimBody,
  ProcessWaiversResponse,
  ShopItemsResponse,
  ShopPurchaseBody,
  ShopSellBody,
  MarketplaceSettingsResponse,
  MarketplaceSettingsUpdateBody,
  MarketplaceTransactionsResponse,
  TeamTransactionsResponse
} from "../modules/marketplace/items.schemas";

export function registerMarketplaceRoutes(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuthHook }
) {
  const { requireAuth } = deps;

  // ───────────────────────────
  // Marketplace browse (teams / rosters)
  // ───────────────────────────

  app.get<{
    Params: { seasonId: string };
    Reply: MarketplaceTeamsResponse;
  }>(
    "/seasons/:seasonId/marketplace/teams",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = tradesService.listMarketplaceTeams(request.params.seasonId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: MarketplaceTeamRosterResponse;
  }>(
    "/seasons/:seasonId/marketplace/teams/:teamId/roster",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const roster = tradesService.getMarketplaceTeamRoster(
          request.params.seasonId,
          request.params.teamId,
          user
        );
        reply.send(roster);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Trades
  // ───────────────────────────

  app.post<{
    Params: { seasonId: string };
    Body: CreateTradeBody;
    Reply: TradeDetailResponse;
  }>(
    "/seasons/:seasonId/marketplace/trades",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const trade = tradesService.createTrade(request.params.seasonId, user, request.body);
        reply.code(201).send(trade);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.get<{
    Params: { seasonId: string };
    Querystring: TradeListQuery;
    Reply: TradeListResponse;
  }>(
    "/seasons/:seasonId/marketplace/trades",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const list = tradesService.listTrades(request.params.seasonId, user, request.query ?? {});
        reply.send(list);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.get<{
    Params: { seasonId: string; tradeId: string };
    Reply: TradeDetailResponse;
  }>(
    "/seasons/:seasonId/marketplace/trades/:tradeId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const trade = tradesService.getTrade(request.params.seasonId, request.params.tradeId, user);
        reply.send(trade);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string; tradeId: string };
    Reply: TradeDetailResponse;
  }>(
    "/seasons/:seasonId/marketplace/trades/:tradeId/accept",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const trade = tradesService.acceptTrade(request.params.seasonId, request.params.tradeId, user);
        reply.send(trade);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string; tradeId: string };
    Body: RejectTradeBody;
    Reply: TradeDetailResponse;
  }>(
    "/seasons/:seasonId/marketplace/trades/:tradeId/reject",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const trade = tradesService.rejectTrade(
          request.params.seasonId,
          request.params.tradeId,
          user,
          request.body
        );
        reply.send(trade);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string; tradeId: string };
    Body: TradeCounterBody;
    Reply: TradeDetailResponse;
  }>(
    "/seasons/:seasonId/marketplace/trades/:tradeId/counter",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const trade = tradesService.counterTrade(
          request.params.seasonId,
          request.params.tradeId,
          user,
          request.body
        );
        reply.send(trade);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Free agency / waivers
  // ───────────────────────────

  app.get<{
    Params: { seasonId: string };
    Reply: FreeAgentsListResponse;
  }>(
    "/seasons/:seasonId/free-agents",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const result = itemsService.listFreeAgents(request.params.seasonId, user);
        reply.send(result);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string };
    Body: FreeAgentClaimBody;
  }>(
    "/seasons/:seasonId/free-agents/claim",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        itemsService.submitFreeAgentClaim(request.params.seasonId, user, request.body);
        reply.code(202).send({ ok: true });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string };
    Reply: ProcessWaiversResponse;
  }>(
    "/seasons/:seasonId/free-agents/process-waivers",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = itemsService.processWaivers(request.params.seasonId, user);
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Shop
  // ───────────────────────────

  app.get<{
    Params: { seasonId: string };
    Reply: ShopItemsResponse;
  }>(
    "/seasons/:seasonId/shop/items",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const items = itemsService.listShopItems(request.params.seasonId, user);
        reply.send(items);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string };
    Body: ShopPurchaseBody;
  }>(
    "/seasons/:seasonId/shop/purchase",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        itemsService.purchaseItem(request.params.seasonId, user, request.body);
        reply.code(201).send({ ok: true });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.post<{
    Params: { seasonId: string };
    Body: ShopSellBody;
  }>(
    "/seasons/:seasonId/shop/sell",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        itemsService.sellItem(request.params.seasonId, user, request.body);
        reply.code(201).send({ ok: true });
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  // ───────────────────────────
  // Marketplace settings + transactions
  // ───────────────────────────

  app.get<{
    Params: { seasonId: string };
    Reply: MarketplaceSettingsResponse;
  }>(
    "/seasons/:seasonId/marketplace/settings",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = itemsService.getMarketplaceSettings(request.params.seasonId, user);
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.patch<{
    Params: { seasonId: string };
    Body: MarketplaceSettingsUpdateBody;
    Reply: MarketplaceSettingsResponse;
  }>(
    "/seasons/:seasonId/marketplace/settings",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = itemsService.updateMarketplaceSettings(request.params.seasonId, user, request.body);
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.get<{
    Params: { seasonId: string };
    Reply: MarketplaceTransactionsResponse;
  }>(
    "/seasons/:seasonId/marketplace/transactions",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = itemsService.listMarketplaceTransactions(request.params.seasonId, user);
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );

  app.get<{
    Params: { seasonId: string; teamId: string };
    Reply: TeamTransactionsResponse;
  }>(
    "/seasons/:seasonId/marketplace/transactions/:teamId",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = request.user!;
        const res = itemsService.listTeamTransactions(
          request.params.seasonId,
          request.params.teamId,
          user
        );
        reply.send(res);
      } catch (err) {
        const { statusCode, payload } = toErrorResponse(err);
        reply.code(statusCode).send(payload);
      }
    }
  );
}
