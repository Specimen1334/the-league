// apps/api/src/modules/draft/draft.realtime.ts
import type { ServerResponse } from "node:http";

type DraftEventName =
  | "draft:lobby"
  | "draft:state"
  | "draft:pool"
  | "draft:watchlist"
  | "draft:presence";

export type DraftSseEvent = {
  event: DraftEventName;
  /** JSON-serialisable payload */
  data: unknown;
};

type Client = {
  res: ServerResponse;
};

// seasonId -> set of SSE clients
const clientsBySeason = new Map<number, Set<Client>>();

// seasonId -> userId -> lastSeenMs
const presenceBySeason = new Map<number, Map<number, number>>();

const KEEPALIVE_MS = 15_000;
const PRESENCE_TTL_MS = 45_000;

function getClientSet(seasonId: number): Set<Client> {
  let set = clientsBySeason.get(seasonId);
  if (!set) {
    set = new Set();
    clientsBySeason.set(seasonId, set);
  }
  return set;
}

function getPresenceMap(seasonId: number): Map<number, number> {
  let map = presenceBySeason.get(seasonId);
  if (!map) {
    map = new Map();
    presenceBySeason.set(seasonId, map);
  }
  return map;
}

function sseWrite(res: ServerResponse, evt: DraftSseEvent) {
  // SSE format: event/name lines + data line(s) + blank line
  res.write(`event: ${evt.event}\n`);
  res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
}

function prunePresence(seasonId: number, nowMs: number): number[] {
  const map = getPresenceMap(seasonId);
  const removed: number[] = [];
  for (const [userId, lastSeen] of map.entries()) {
    if (nowMs - lastSeen > PRESENCE_TTL_MS) {
      map.delete(userId);
      removed.push(userId);
    }
  }
  return removed;
}

export const draftRealtime = {
  /**
   * Attach an SSE client for a season. Caller must have already set headers
   * and ended the reply lifecycle to keep the socket open.
   */
  addSseClient(seasonId: number, res: ServerResponse): () => void {
    const client: Client = { res };
    const set = getClientSet(seasonId);
    set.add(client);

    // Immediately send a hello so the client can confirm the stream is live.
    sseWrite(res, { event: "draft:presence", data: { ok: true } });

    const keepAlive = setInterval(() => {
      try {
        // Comment keeps most proxies from closing the stream.
        res.write(`: keepalive\n\n`);
      } catch {
        // ignore
      }
    }, KEEPALIVE_MS);

    const cleanup = () => {
      clearInterval(keepAlive);
      set.delete(client);
      if (set.size === 0) clientsBySeason.delete(seasonId);
    };

    // Ensure cleanup on connection close.
    res.on("close", cleanup);
    res.on("error", cleanup);
    return cleanup;
  },

  emit(seasonId: number, event: DraftEventName, data: unknown) {
    const set = clientsBySeason.get(seasonId);
    if (!set || set.size === 0) return;

    for (const client of Array.from(set)) {
      try {
        sseWrite(client.res, { event, data });
      } catch {
        // Drop broken clients.
        set.delete(client);
      }
    }
    if (set.size === 0) clientsBySeason.delete(seasonId);
  },

  /** Record a presence heartbeat for a season/user. Returns list of online userIds. */
  heartbeat(seasonId: number, userId: number): number[] {
    const now = Date.now();
    const map = getPresenceMap(seasonId);
    map.set(userId, now);
    prunePresence(seasonId, now);
    return Array.from(map.keys()).sort((a, b) => a - b);
  },

  /** Get online userIds, after pruning stale entries. */
  listOnline(seasonId: number): number[] {
    const now = Date.now();
    prunePresence(seasonId, now);
    return Array.from(getPresenceMap(seasonId).keys()).sort((a, b) => a - b);
  }
};
