// apps/web/src/app/draft/[id]/room/page.tsx

"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { authHeaders, isLoggedIn, logout } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { extractBaseAndFormFromName, baseFromSlug, formatDisplayName } from "@/kit/names";
import { Sprite } from "@/kit/sprites";
import { TypeBadge, Stat, Filters } from "@/kit/ui";
import { useDraftClock, useIsMobile } from "@/kit/hooks";
import {
  fetchState, fetchLobby,
  startDraftSvc, pauseDraftSvc, endDraftSvc, undoLastSvc,
  saveSettingsSvc, saveOrderSvc, makePickSvc,
  createLeagueFromDraftSvc, deleteDraftSvc,
} from "@/kit/drafts";
import type { DraftStatus, DraftCore, StateResp, OrderRow, PickRow } from "@/kit/types";
import { TYPES, teamTypeSet, defenseSummary } from "@/kit/combat";
import { API_BASE as API } from "@/kit/api";

/* ========================================================
   Types local to this page
   ======================================================== */
type PlayerCard = {
  id?: number;
  name: string;
  slug: string;
  draftable: boolean;
  points: number | null;

  form_index?: number | null;
  form_label?: string | null;
  base_name?: string | null;
  base_slug?: string | null;
  gender?: "Male" | "Female" | null;

  types?: string[];
  abilities?: string[];
  base_stats?: { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
  moves?: string[];
};

// What the lobby participants *may* have now that we’re username-first.
// We’ll be defensive and accept multiple shapes (old/new).
type Participant = {
  team_id: number | null;
  manager_user_id: number;
  // New username-first fields (one or more may exist depending on API)
  manager_username?: string | null;
  username?: string | null;
  participant_username?: string | null;
  // Fallbacks
  team_name?: string | null;
  manager_display_name?: string | null;
};

/* ========================================================
   Utils
   ======================================================== */
function titlify(s: string) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
function decodeMyUserId(): number | null {
  try {
    const tok = localStorage.getItem("token");
    if (!tok) return null;
    const [, payload] = tok.split(".");
    if (!payload) return null;
    const p = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const sub = p?.sub;
    return typeof sub === "number" ? sub : (sub ? Number(sub) : null);
  } catch { return null; }
}

// Username-first label: prefer usernames; fall back to team_name; else a generic.
function labelForParticipant(p?: Participant | null): string {
  if (!p) return "—";
  const handle =
    p.manager_username ||
    p.username ||
    p.participant_username ||
    null;
  if (handle && String(handle).trim()) return `@${String(handle).trim()}`;
  if (p.team_name && String(p.team_name).trim()) return p.team_name!;
  if (p.manager_display_name && String(p.manager_display_name).trim()) return p.manager_display_name!;
  return `User ${p.manager_user_id}`;
}

/* ========================================================
   Draft data services — thin wrappers per page needs
   ======================================================== */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || text || "Request failed";
    throw new Error(message);
  }
  return (data as T);
}
async function postAction(path: string, body?: any) {
  return fetchJSON<any>(`${API}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ========================================================
   useDraftRoom — connection, state, actions
   ======================================================== */
function useDraftRoom(draftId: number) {
  const [state, setState] = useState<StateResp | null>(null);
  const [lobby, setLobby] = useState<{
    draft: any;
    participants: Participant[];
    invites: { email: string; status: string }[];
    status: DraftStatus;
    is_commissioner: boolean;
    presence: { userId: number; teamId: number | null }[];
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const myUserId = useMemo(decodeMyUserId, []);
  const myTeamRef = useRef<number | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | null>(null);

  // mounted guard for async setState
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const guarded = useCallback(async <T,>(fn: () => Promise<T>) => {
    try { return await fn(); }
    catch (e: any) {
      const m = String(e?.message || "").toLowerCase();
      if (m.includes("unauthorized") || /401/.test(m)) {
        logout();
        // don’t navigate here — page will redirect on auth check in parent effect
      }
      throw e;
    }
  }, []);

  const loadState = useCallback(async () => {
    try { const j = await guarded(() => fetchState(draftId)); if (mountedRef.current) setState(j); }
    catch (e: any) { if (mountedRef.current) setError(e?.message ?? String(e)); }
  }, [draftId, guarded]);

  const loadLobby = useCallback(async () => {
    try { const j = await guarded(() => fetchLobby(draftId)); if (mountedRef.current) setLobby(j as any); }
    catch (e: any) { if (mountedRef.current) setError(e?.message ?? String(e)); }
  }, [draftId, guarded]);

  // My team
  useEffect(() => {
    if (!lobby?.participants || !myUserId) return;
    const mine = lobby.participants.find((p) => p.manager_user_id === myUserId);
    const tid = mine?.team_id ?? null;
    myTeamRef.current = tid;
    setMyTeamId(tid);
  }, [lobby?.participants, myUserId]);

  // Presence heartbeat
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    async function beat() {
      try {
        await fetch(`${API}/drafts/${draftId}/presence`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: myTeamRef.current }),
        });
      } catch {}
      if (!alive) return;
      t = setTimeout(beat, 5000);
    }
    if (draftId) beat();
    return () => { alive = false; if (t) clearTimeout(t); };
  }, [draftId]);

  // SSE with auto-retry
  useEffect(() => {
    if (!draftId) return;
    let es: EventSource | null = null;
    let retry = 0;
    const connect = () => {
      es = new EventSource(`${API}/drafts/${draftId}/stream`, { withCredentials: true });
      const reloadAll = () => { loadState(); loadLobby(); };
      es.addEventListener("presence:update", () => setTimeout(loadLobby, 50));
      es.addEventListener("lobby:update", () => setTimeout(loadLobby, 50));
      es.addEventListener("draft:status", () => reloadAll());
      es.addEventListener("state:update", () => setTimeout(loadState, 50));
      es.addEventListener("draft:settings", () => setTimeout(loadState, 50));
      es.onerror = () => {
        es?.close();
        if (!mountedRef.current) return;
        const delay = Math.min(15000, 1000 * 2 ** retry++);
        setTimeout(connect, delay);
      };
    };
    connect();
    return () => es?.close();
  }, [draftId, loadState, loadLobby]);

  // Initial load
  useEffect(() => { loadState(); loadLobby(); }, [loadState, loadLobby]);

  const isCommish = !!lobby?.is_commissioner;
  const status: DraftStatus = state?.status ?? lobby?.status ?? "pending";

  // Actions scaffold
  const doAction = useCallback(async (fn: () => Promise<any>, okMsg = "Done.") => {
    if (!mountedRef.current) return;
    setMsg(""); setError(""); setLoading(true);
    try {
      await fn();
      setMsg(okMsg);
      await Promise.all([loadState(), loadLobby()]);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadState, loadLobby]);

  const startDraft = useCallback(() => doAction(() => startDraftSvc(draftId)), [doAction, draftId]);
  const pauseDraft = useCallback(() => doAction(() => pauseDraftSvc(draftId)), [doAction, draftId]);
  const endDraft = useCallback(() => doAction(() => endDraftSvc(draftId)), [doAction, draftId]);
  const undoLast = useCallback(() => doAction(() => undoLastSvc(draftId)), [doAction, draftId]);
  const saveSettings = useCallback((patch: Partial<{ clock_seconds: number; points_cap: number | null; rounds: number; type: "snake" | "linear" }>) =>
    doAction(() => saveSettingsSvc(draftId, patch)), [doAction, draftId]);
  const saveOrder = useCallback((teamIds: number[]) =>
    doAction(() => saveOrderSvc(draftId, teamIds)), [doAction, draftId]);
  const makePick = useCallback(async (playerId: number, teamId: number | null) => {
    await doAction(async () => {
      const payload: any = { playerId, player_id: playerId, pokemon_id: playerId };
      if (teamId != null) payload.team_id = teamId;
      await makePickSvc(draftId, payload);
    }, "Pick locked!");
  }, [doAction, draftId]);

  const createLeagueFromDraft = useCallback((leagueName: string) =>
    doAction(() => createLeagueFromDraftSvc(draftId, leagueName), "League created and draft imported."), [doAction, draftId]);

  const deleteDraft = useCallback(() =>
    doAction(() => deleteDraftSvc(draftId), "Draft deleted."), [doAction, draftId]);

  // Username-first display for a team slot
  const teamLabel = useCallback((teamId?: number | null) => {
    if (!teamId || !lobby?.participants) return "—";
    const p = lobby.participants.find((x) => x.team_id === teamId) || null;
    return labelForParticipant(p);
  }, [lobby?.participants]);

  // Username-only label for the next-on-clock area (if teamId not present)
  const userLabelByUserId = useCallback((userId?: number | null) => {
    if (!userId || !lobby?.participants) return "—";
    const p = lobby.participants.find((x) => x.manager_user_id === userId) || null;
    return labelForParticipant(p);
  }, [lobby?.participants]);

  return {
    state, lobby, status, isCommish,
    msg, error, loading, setError, setMsg,
    myTeamId, teamLabel, userLabelByUserId,
    loadState, loadLobby,
    startDraft, pauseDraft, endDraft, undoLast, saveSettings, saveOrder, makePick,
    createLeagueFromDraft, deleteDraft,
  };
}

/* ========================================================
   usePlayerPool — search, filters, sort, watch, flip
   ======================================================== */
function usePlayerPool(draftId: number, state: StateResp | null) {
  // Filters
  const [filters, setFilters] = useState({
    q: "", type: "", ability: "", move: "",
    minPoints: "", maxPoints: "",
    sortKey: "id" as "id" | "pts" | "hp" | "atk" | "def" | "spa" | "spd" | "spe",
    sortDir: "asc" as "asc" | "desc",
    hideDrafted: true,
  });
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Players
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const playersById = useMemo(() => {
    const map = new Map<number, PlayerCard>();
    for (const p of players) if (p.id != null) map.set(p.id, p);
    return map;
  }, [players]);

  // Drafted IDs
  const draftedIds = useMemo(
    () => new Set((state?.picks ?? []).map((p) => p.player_id).filter(Boolean) as number[]),
    [state?.picks]
  );

  // Search helpers
  const coalesce = <T,>(...vals: T[]): T | undefined => vals.find((v) => v !== undefined && v !== null) as any;
  function unslug(s: string): string {
    if (!s) return "";
    return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const rawId = (p: any) => p.id ?? p.player_id ?? p.pokemon_id ?? undefined;
  const rawSlug = (p: any) => p.slug ?? p.player_slug ?? String(rawId(p) ?? "");

  // Debounced + abortable search to avoid races
  const searchAbort = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlayers = useCallback(async () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      searchAbort.current?.abort();
      const ac = new AbortController();
      searchAbort.current = ac;

      const qs = new URLSearchParams();
      if (filters.q) qs.set("q", filters.q);
      if (filters.type) qs.set("type", filters.type);
      if (filters.ability) qs.set("ability", filters.ability);
      if (filters.move) qs.set("move", filters.move);
      if (filters.minPoints) qs.set("minPoints", String(filters.minPoints));
      if (filters.maxPoints) qs.set("maxPoints", String(filters.maxPoints));
      qs.set("draftableOnly", "1");

      setLoadingPlayers(true);
      try {
        const res = await fetch(`${API}/players?${qs.toString()}`, {
          headers: { ...authHeaders() },
          signal: ac.signal,
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Search failed");

        const list = (j.players as any[]).map((p) => {
          const id = rawId(p);
          const slug = rawSlug(p);

          const providedBase = coalesce(p.base_name, p.base_species, p.base) ?? null;
          const providedFormLabel = coalesce(p.form_label, p.form_name, p.variant, p.form) ?? null;
          const providedFormIndex = coalesce(p.form_index, p.form_number, p.sprite_index, p.variant_index, p.formId) ?? null;
          const providedGender = coalesce(p.gender, p.sex) ?? null;

          const rawName =
            p.name ?? p.player_name ?? p.display_name ?? p.full_name ?? p.species ?? p.pokemon ?? unslug(slug);

          const { base: inferredBase, form: inferredForm } = extractBaseAndFormFromName(rawName);
          const baseName = (providedBase as string | null) ?? inferredBase;
          const formLabel = (providedFormLabel as string | null) ?? inferredForm;

          const rawPts = p.points ?? p.cost ?? p.value;
          const pts = rawPts == null
            ? NaN
            : Number(typeof rawPts === "string" ? rawPts.trim() : rawPts);

          return {
            ...p,
            id,
            slug,
            name: rawName,
            base_name: baseName,
            base_slug: (baseName || "").toLowerCase().replace(/\s+/g, "-"),
            form_label: formLabel,
            form_index: providedFormIndex != null ? Number(providedFormIndex) : null,
            gender: providedGender,

            points: Number.isFinite(pts) ? pts : null,
            types: p.types ?? p.type ?? p.type_list ?? [],
            abilities: p.abilities ?? p.ability_list ?? p.ability ?? [],
            base_stats:
              p.base_stats ??
              p.stats ?? {
                hp: p.hp, atk: p.atk, def: p.def,
                spa: p.spa ?? p.spA, spd: p.spd ?? p.spD, spe: p.spe,
              },
          } as PlayerCard;
        });

        setPlayers(list);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error(e);
      } finally {
        setLoadingPlayers(false);
      }
    }, 200);
  }, [filters]);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
  }, []);

  useEffect(() => { searchPlayers(); /* mount */ }, []); // eslint-disable-line

  // Watchlist
  const WATCH_KEY = `draft:${draftId}:watchlist`;
  const [watch, setWatch] = useState<Set<number>>(() => {
    try { const raw = localStorage.getItem(WATCH_KEY); return new Set<number>(raw ? JSON.parse(raw) : []); }
    catch { return new Set<number>(); }
  });
  function toggleWatch(id?: number) {
    if (id == null) return;
    setWatch((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(WATCH_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }
  const watchedPlayers = useMemo(() => {
    const arr: PlayerCard[] = [];
    watch.forEach((id) => { const p = playersById.get(id); if (p) arr.push(p); });
    arr.sort((a, b) => {
      const ad = draftedIds.has(a.id!); const bd = draftedIds.has(b.id!);
      if (ad !== bd) return ad ? 1 : -1;
      return (a.name || "").localeCompare(b.name || "");
    });
    return arr;
  }, [watch, playersById, draftedIds]);

  // Sorting + filtering
  const sortedFilteredPlayers = useMemo(() => {
    const minP = filters.minPoints === "" ? -Infinity : Number(filters.minPoints);
    const maxP = filters.maxPoints === "" ?  Infinity : Number(filters.maxPoints);

    const base = players
      .filter((p) => !filters.hideDrafted || !draftedIds.has(p.id ?? -1))
      .filter((p) => {
        if (filters.minPoints === "" && filters.maxPoints === "") return true;
        const ptsRaw = p.points;
        const pts = typeof ptsRaw === "number" ? ptsRaw : Number(ptsRaw);
        return Number.isFinite(pts) && pts >= minP && pts <= maxP;
      });

    const dir = filters.sortDir === "asc" ? 1 : -1;

    const getVal = (p: PlayerCard): number | null => {
      if (filters.sortKey === "id") return p.id ?? null;
      if (filters.sortKey === "pts") {
        const ptsRaw = p.points;
        const pts = typeof ptsRaw === "number" ? ptsRaw : Number(ptsRaw);
        return Number.isFinite(pts) ? pts : null;
      }
      const s = p.base_stats || {};
      switch (filters.sortKey) {
        case "hp":  return s.hp  ?? null;
        case "atk": return s.atk ?? null;
        case "def": return s.def ?? null;
        case "spa": return s.spa ?? null;
        case "spd": return s.spd ?? null;
        case "spe": return s.spe ?? null;
        default:    return null;
      }
    };

    return base.slice().sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      const am = va == null, bm = vb == null;
      if (am !== bm) return am ? 1 : -1; // nulls/unknowns last
      return ((va as number) - (vb as number)) * dir;
    });
  }, [
    players,
    filters.hideDrafted,
    filters.minPoints,
    filters.maxPoints,
    filters.sortKey,
    filters.sortDir,
    draftedIds,
  ]);

  // Flip + sheet
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [sheetFor, setSheetFor] = useState<number | null>(null);
  function toggleFlip(id?: number) {
    if (id == null) return;
    setFlipped((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // View mode & filters collapsed
  const VIEW_KEY = `draft:${draftId}:poolView`;
  const [viewMode, setViewMode] = useState<"flip" | "classic">(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return (saved === "classic" || saved === "flip") ? (saved as any) : "flip";
    } catch { return "flip"; }
  });
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, viewMode); } catch {} }, [viewMode, VIEW_KEY]);

  const FILTERS_COLLAPSED_KEY = `draft:${draftId}:filtersCollapsed`;
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(() => {
    try { const saved = localStorage.getItem(FILTERS_COLLAPSED_KEY); return saved ? saved === "1" : false; }
    catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(FILTERS_COLLAPSED_KEY, filtersCollapsed ? "1" : "0"); } catch {} }, [filtersCollapsed, FILTERS_COLLAPSED_KEY]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q) n++;
    if (filters.type) n++;
    if (filters.ability) n++;
    if (filters.move) n++;
    if (filters.minPoints) n++;
    if (filters.maxPoints) n++;
    return n;
  }, [filters.q, filters.type, filters.ability, filters.move, filters.minPoints, filters.maxPoints]);

  // Reset watch/flip when moving rooms
  useEffect(() => {
    try { const raw = localStorage.getItem(WATCH_KEY); setWatch(new Set(raw ? JSON.parse(raw) : [])); } catch {}
    setFlipped(new Set());
  }, [draftId]);

  return {
    // data
    filters, setFilters, loadingPlayers, searchPlayers,
    playersById, sortedFilteredPlayers,
    draftedIds,
    // watchlist
    watch, toggleWatch, watchedPlayers,
    // flip/sheet/view
    flipped, toggleFlip, sheetFor, setSheetFor,
    viewMode, setViewMode,
    filtersCollapsed, setFiltersCollapsed, activeFilterCount,
  };
}

/* ========================================================
   Small page-local component: labeled field wrapper
   ======================================================== */
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="opacity-80">{label}</span>
      {children}
    </label>
  );
}

function CoveragePanel({ myTeamPlayers }: { myTeamPlayers: PlayerCard[] }) {
  const [mode, setMode] = useState<"team" | "defense">("team");

  const have = useMemo(() => teamTypeSet(myTeamPlayers), [myTeamPlayers]);
  const missing = useMemo(() => TYPES.filter(t => !have.has(t)), [have]);
  const defenseRows = useMemo(() => defenseSummary(myTeamPlayers), [myTeamPlayers]);

  return (
    <div className="rounded-2xl p-3 bg-black/30 border border-white/5 h-full grid grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold">Coverage</h4>
        <div className="ml-auto rounded-xl bg-white/10 p-1">
          <button
            className={`px-3 py-1 rounded-lg text-sm ${mode === "team" ? "bg-secondary text-white" : "text-white/80 hover:bg-white/15"}`}
            onClick={() => setMode("team")}
          >Types you have</button>
          <button
            className={`ml-1 px-3 py-1 rounded-lg text-sm ${mode === "defense" ? "bg-secondary text-white" : "text-white/80 hover:bg-white/15"}`}
            onClick={() => setMode("defense")}
          >Defense</button>
        </div>
      </div>

      {mode === "team" ? (
        <div className="grid gap-3 overflow-auto pr-1">
          <div>
            <div className="text-xs opacity-75 mb-1">You have</div>
            <div className="flex flex-wrap gap-1">
              {Array.from(have).length
                ? Array.from(have).map(t => <TypeBadge key={`have-${t}`} t={t} />)
                : <span className="text-sm opacity-70">No types yet.</span>}
            </div>
          </div>
          <div>
            <div className="text-xs opacity-75 mb-1">You lack</div>
            <div className="flex flex-wrap gap-1">
              {missing.length
                ? missing.map(t => <div key={`lack-${t}`} className="opacity-60"><TypeBadge t={t} /></div>)
                : <span className="text-sm opacity-70">You cover every type.</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-auto pr-1">
          <div className="text-xs opacity-75 mb-2">Incoming attack types → team response</div>
          <div className="grid gap-1">
            {defenseRows.map(({ att, weak, neutral, resist, immune }) => (
              <div key={att} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-2 py-1">
                <div className="shrink-0"><TypeBadge t={att} /></div>
                <div className="ml-auto flex items-center gap-2 text-[12px]">
                  <span className="px-2 py-0.5 rounded bg-red-500/30 border border-red-500/40">{weak} weak</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/30 border border-emerald-500/40">{resist} resist</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/30 border border-blue-500/40">{immune} immune</span>
                </div>
              </div>
            ))}
          </div>
          {myTeamPlayers.length === 0 && <div className="mt-2 text-sm opacity-70">No drafted Pokémon yet.</div>}
        </div>
      )}
    </div>
  );
}

/* ========================================================
   Order editor, Details sheet, Settings panel, End modal
   ======================================================== */
function PresenceList({
  presence, participants,
}: {
  presence: { userId: number; teamId: number | null }[];
  participants: Participant[];
}) {
  const activeTeamIds = new Set(presence.map((p) => p.teamId).filter(Boolean) as number[]);
  const byUserId = new Map<number, Participant>();
  participants.forEach((p) => byUserId.set(p.manager_user_id, p));
  return (
    <div className="mt-2">
      <h4 className="text-sm font-semibold mb-1">Presence</h4>
      <div className="grid gap-1">
        {participants.map((p) => {
          const on = p.team_id ? activeTeamIds.has(p.team_id) : false;
          const label = labelForParticipant(p);
          return (
            <div
              key={p.manager_user_id}
              className={`px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${
                on ? "bg-success text-black" : "bg-white/10 text-white/80 border border-white/5"
              }`}
              title={on ? "Online" : "Offline"}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-emerald-700" : "bg-white/40"}`} />
              <span className="font-medium">{label}</span>
            </div>
          );
        })}
        {participants.length === 0 && <div className="opacity-80 text-sm">No participants yet.</div>}
      </div>
    </div>
  );
}

function OrderEditor({
  participants, currentOrder, onSave, onClose,
}: {
  participants: Participant[];
  currentOrder: number[];
  onSave: (teamIds: number[]) => Promise<void>;
  onClose: () => void;
}) {
  const lobbyTeams = participants.filter((p) => p.team_id != null) as Required<Pick<Participant, "team_id">> & Participant[];
  const initialSeq = (currentOrder && currentOrder.length ? currentOrder : lobbyTeams.map((p: any) => p.team_id)).filter(Boolean) as number[];
  const [seq, setSeq] = useState<number[]>(initialSeq);

  useEffect(() => {
    const ids = new Set(seq);
    const missing = lobbyTeams.map((t: any) => t.team_id).filter((id) => !ids.has(id));
    if (missing.length) setSeq((s) => [...s, ...missing]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants.length]);

  function nameOf(id: number) {
    const p = lobbyTeams.find((t: any) => t.team_id === id) as Participant | undefined;
    return p ? labelForParticipant(p) : `Team ${id}`;
  }
  function up(i: number) { if (i <= 0) return; const a = seq.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setSeq(a); }
  function down(i: number) { if (i >= seq.length - 1) return; const a = seq.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; setSeq(a); }
  function remove(i: number) { const a = seq.slice(); a.splice(i, 1); setSeq(a); }
  function randomize() { const a = seq.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } setSeq(a); }

  const canSave = seq.length >= 2;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-4 z-50">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-2 border border-white/10 p-4 text-white grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Set Draft Order</h3>
          <button className="ml-auto px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15" onClick={onClose}>Close</button>
        </div>
        <p className="text-sm opacity-80">Arrange from pick <b>#1</b> (top) to last (bottom). Save to apply.</p>
        <div className="grid gap-2 max-h-[50vh] overflow-auto pr-1">
          {seq.map((id, i) => (
            <div key={id} className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-2">
              <span className="text-xs opacity-70 w-6">#{i + 1}</span>
              <span className="font-medium flex-1 truncate">{nameOf(id)}</span>
              <div className="flex items-center gap-1">
                <button className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15" onClick={() => up(i)} aria-label="Move up">↑</button>
                <button className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15" onClick={() => down(i)} aria-label="Move down">↓</button>
                <button className="px-2 py-1 rounded-lg bg-danger hover:brightness-110" onClick={() => remove(i)} aria-label="Remove">Remove</button>
              </div>
            </div>
          ))}
          {seq.length === 0 && <div className="opacity-80 text-sm">No teams.</div>}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={randomize}>Randomize</button>
          <button
            className="ml-auto px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
            disabled={!canSave}
            onClick={() => onSave(seq)}
          >
            Save order
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsSheet({
  open, player, onClose, onDraft, watched, onToggleWatch, isMyTurn,
}: {
  open: boolean;
  player: PlayerCard | null;
  onClose: () => void;
  onDraft: (id?: number) => void;
  watched: boolean;
  onToggleWatch: (id?: number) => void;
  isMyTurn: boolean;
}) {
  return (
    <AnimatePresence>
      {open && player && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            className="absolute inset-x-0 bottom-0 bg-surface-2 border-t border-white/10 rounded-t-2xl p-4"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold truncate">
                {formatDisplayName(player.base_name || extractBaseAndFormFromName(player.name).base, player.form_label, player.gender)}
              </h4>
              <button className="ml-auto px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15" onClick={onClose}>Close</button>
            </div>

            <div className="mt-3 grid grid-cols-[5.5rem_1fr] gap-3 items-start">
              <div className="relative h-24 w-24 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                {/* Types */}
                <div className="absolute top-1 left-1 flex gap-1 z-10">
                  {(player.types || []).map((t) => <TypeBadge key={t} t={t} />)}
                </div>
                {/* Star */}
                <button
                  className={`absolute top-1 right-1 text-lg leading-none rounded-md px-1.5 py-0.5 z-10
                              ${watched ? "bg-amber-400/90 text-black" : "bg-black/40 text-white/90 hover:bg-black/55"}`}
                  onClick={() => onToggleWatch(player.id)}
                  aria-pressed={watched}
                >
                  {watched ? "★" : "☆"}
                </button>

                <Sprite
                  slug={player.slug}
                  baseName={player.base_name || baseFromSlug(player.slug)}
                  formIndex={player.form_index ?? null}
                  gender={player.gender ?? undefined}
                  alt={player.name}
                  className="absolute inset-0 m-auto w-[85%] h-[85%] object-contain"
                />
              </div>

              <div className="min-w-0">
                <div className="grid grid-rows-3 grid-flow-col auto-cols-fr gap-1">
                  <div className="w-full"><Stat label="HP"  v={player.base_stats?.hp} /></div>
                  <div className="w-full"><Stat label="Atk" v={player.base_stats?.atk} /></div>
                  <div className="w-full"><Stat label="Def" v={player.base_stats?.def} /></div>
                  <div className="w-full"><Stat label="SpA" v={player.base_stats?.spa} /></div>
                  <div className="w-full"><Stat label="SpD" v={player.base_stats?.spd} /></div>
                  <div className="w-full"><Stat label="Spe" v={player.base_stats?.spe} /></div>
                </div>

                {!!player.abilities?.length && (
                  <div className="mt-2 text-[12px] leading-tight bg-black/30 backdrop-blur-sm rounded-md px-2 py-1 max-h-20 overflow-auto">
                    <span className="opacity-70">Abilities: </span>
                    <span>{player.abilities.join(", ")}</span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
                    onClick={() => onDraft(player.id)}
                    disabled={!isMyTurn}
                  >
                    Draft
                  </button>
                  <button
                    className={`px-3 py-2 rounded-xl ${watched ? "bg-amber-400 text-black" : "bg-white/10"} hover:bg-white/15`}
                    onClick={() => onToggleWatch(player.id)}
                  >
                    {watched ? "★ Watching" : "☆ Watch"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SettingsPanel({
  draft, onSave, disabled,
}: { draft?: DraftCore; onSave: (p: any) => Promise<void>; disabled?: boolean }) {
  const [clock, setClock] = useState<number>(draft?.clock_seconds ?? 60);
  const [cap, setCap] = useState<string>(draft?.points_cap == null ? "" : String(draft.points_cap));
  const [rounds, setRounds] = useState<number>(draft?.rounds ?? 8);
  const [type, setType] = useState<"snake" | "linear">(draft?.type ?? "snake");

  useEffect(() => {
    if (!draft) return;
    setClock(draft.clock_seconds);
    setRounds(draft.rounds);
    setType(draft.type);
    setCap(draft.points_cap == null ? "" : String(draft.points_cap));
  }, [draft?.id]); // eslint-disable-line

  async function save() {
    const body: any = { clock_seconds: Number(clock) };
    body.points_cap = cap === "" ? null : Number(cap);
    body.rounds = Number(rounds);
    body.type = type;
    await onSave(body);
  }

  return (
    <div className="mt-3 grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <L label="Pick timer (seconds)">
          <input
            type="number"
            min={0}
            className="px-3 py-2 rounded-xl bg-white/80 outline-none"
            value={clock}
            onChange={(e) => setClock(Number(e.target.value || 0))}
          />
        </L>
        <L label="Points cap (blank = none)">
          <input
            className="px-3 py-2 rounded-xl bg-white/80 outline-none"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
          />
        </L>
        <L label="Rounds">
          <input
            type="number"
            min={1}
            className="px-3 py-2 rounded-xl bg-white/80 outline-none"
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value || 0))}
          />
        </L>
        <L label="Draft type">
          <select
            className="px-3 py-2 rounded-xl bg-white/80 outline-none"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="snake">Snake</option>
            <option value="linear">Linear</option>
          </select>
        </L>
      </div>
      <div>
        <button
          onClick={save}
          disabled={disabled}
          className="px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
        >
          Save settings
        </button>
      </div>
    </div>
  );
}

function PlayerCardFlip({
  player, dispName, picked, watched, disabledReason,
  onToggleWatch, onDraft, onFlip, flipped,
}: {
  player: PlayerCard;
  dispName: string;
  picked: boolean;
  watched: boolean;
  disabledReason: string;
  onToggleWatch: (e: React.MouseEvent) => void;
  onDraft: (e: React.MouseEvent) => void;
  onFlip: () => void;
  flipped: boolean;
}) {
  return (
    <div
      className={`group relative rounded-2xl border ${picked ? "bg-black/10 border-white/10 opacity-60" : "bg-black/30 border-white/5"}`}
      role="button"
      aria-pressed={flipped}
      onClick={onFlip}
    >
      {/* 3D flip container */}
      <div className="relative [perspective:1200px] h-full">
        <motion.div
          className="relative [transform-style:preserve-3d] min-h-[17.5rem]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
        >
          {/* FRONT */}
          <div className="absolute inset-0 [backface-visibility:hidden] p-3">
            <div className="grid grid-cols-1 gap-3">
              {/* Sprite with overlays */}
              <div className="relative rounded-xl bg-white/5 border border-white/10 overflow-hidden h-40">
                {/* Types */}
                <div className="absolute top-1 left-1 flex gap-1 z-10">
                  {(player.types || []).map((t) => <TypeBadge key={t} t={t} />)}
                </div>

                {/* Star */}
                <button
                  onClick={onToggleWatch}
                  className={`absolute top-1 right-1 text-lg leading-none rounded-md px-1.5 py-0.5 z-10
                              ${watched ? "bg-amber-400/90 text-black" : "bg-black/40 text-white/90 hover:bg-black/55"}`}
                  aria-pressed={watched}
                  aria-label={`${watched ? "Remove" : "Add"} ${dispName} to watchlist`}
                >
                  {watched ? "★" : "☆"}
                </button>

                <Sprite
                  slug={player.slug}
                  baseName={player.base_name || baseFromSlug(player.slug)}
                  formIndex={player.form_index ?? null}
                  gender={player.gender ?? undefined}
                  alt={dispName}
                  className="absolute inset-0 m-auto w-32 h-32 object-contain"
                />

                {/* Name chip */}
                <div className="absolute bottom-1 left-1 right-1">
                  <div className="px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-[12px] font-semibold" title={dispName}>
                    <span className="block truncate">{dispName}</span>
                  </div>
                </div>

                {/* ID badge */}
                {typeof player.id === "number" && (
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[11px]">#{player.id}</div>
                )}
              </div>

              {/* Points + Draft */}
              <div className="flex items-center gap-2">
                <div className="text-sm opacity-80">
                  {player.points != null ? <span>Points: <b>{player.points}</b></span> : <span>—</span>}
                </div>
                <button
                  onClick={onDraft}
                  disabled={!!disabledReason}
                  className="ml-auto px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
                  aria-label={disabledReason || (player.points != null ? `Draft ${dispName} for ${player.points} points` : `Draft ${dispName}`)}
                  title={disabledReason || `Draft ${dispName}`}
                >
                  {picked ? "Drafted" : "Draft"}
                </button>
              </div>

              {/* Flip hint */}
              <div className="text-[11px] opacity-60">Tap card to view stats & abilities</div>
            </div>
          </div>

          {/* BACK */}
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] p-3">
            <div className="grid gap-2 h-full">
              {/* Stats grid */}
              <div className="grid grid-rows-3 grid-flow-col auto-cols-fr gap-1">
                <div className="w-full"><Stat label="HP"  v={player.base_stats?.hp} /></div>
                <div className="w-full"><Stat label="Atk" v={player.base_stats?.atk} /></div>
                <div className="w-full"><Stat label="Def" v={player.base_stats?.def} /></div>
                <div className="w-full"><Stat label="SpA" v={player.base_stats?.spa} /></div>
                <div className="w-full"><Stat label="SpD" v={player.base_stats?.spd} /></div>
                <div className="w-full"><Stat label="Spe" v={player.base_stats?.spe} /></div>
              </div>

              {/* Abilities */}
              {!!player.abilities?.length && (
                <div className="text-[11px] leading-tight bg-black/30 backdrop-blur-sm rounded-md px-2 py-1 max-h-24 overflow-auto">
                  <span className="opacity-70">Abilities: </span>
                  <span>{player.abilities.join(", ")}</span>
                </div>
              )}

              {/* Back actions */}
              <div className="mt-auto flex items-center gap-2">
                <button
                  onClick={onDraft}
                  disabled={!!disabledReason}
                  className="px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
                >
                  {picked ? "Drafted" : "Draft"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleWatch(e); }}
                  className={`px-3 py-2 rounded-xl ${watched ? "bg-amber-400 text-black" : "bg-white/10"} hover:bg-white/15`}
                >
                  {watched ? "★ Watching" : "☆ Watch"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); }}
                  className="ml-auto px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function PlayerCardClassic({
  player, dispName, picked, watched, disabledReason,
  onToggleWatch, onDraft,
}: {
  player: PlayerCard;
  dispName: string;
  picked: boolean;
  watched: boolean;
  disabledReason: string;
  onToggleWatch: () => void;
  onDraft: () => void;
}) {
  return (
    <div className={`rounded-xl p-3 ${picked ? "bg-black/10 border border-white/10 opacity-60" : "bg-black/30 border border-white/5"}`}>
      <div className="grid grid-cols-[9.5rem_1fr] md:grid-cols-[10rem_1fr] grid-rows-[auto_auto] gap-3 items-start">
        {/* Sprite + overlays */}
        <div className="row-[1] col-[1]">
          <div className="relative rounded-xl bg-white/5 border border-white/10 overflow-hidden h-32 md:h-36">
            {/* Types */}
            <div className="absolute top-1 left-1 flex gap-1 z-10">
              {(player.types || []).map((t) => <TypeBadge key={t} t={t} />)}
            </div>
            {/* Watch star */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleWatch(); }}
              className={`absolute top-1 right-1 text-lg leading-none rounded-md px-1.5 py-0.5 z-10
                          ${watched ? "bg-amber-400/90 text-black" : "bg-black/40 text-white/90 hover:bg-black/55"}`}
              aria-pressed={watched}
              aria-label={`${watched ? "Remove" : "Add"} ${dispName} to watchlist`}
            >
              {watched ? "★" : "☆"}
            </button>

            <Sprite
              slug={player.slug}
              baseName={player.base_name || baseFromSlug(player.slug)}
              formIndex={player.form_index ?? null}
              gender={player.gender ?? undefined}
              alt={dispName}
              className="absolute inset-0 m-auto w-28 h-28 md:w-32 md:h-32 object-contain"
            />

            {/* Name chip */}
            <div className="absolute bottom-1 left-1 right-1">
              <div className="px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-[12px] font-semibold" title={dispName}>
                <span className="block truncate">{dispName}</span>
              </div>
            </div>

            {/* ID badge */}
            {typeof player.id === "number" && (
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[11px]">#{player.id}</div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="row-[1] col-[2] min-w-0 justify-self-stretch self-start">
          <h4 className="sr-only">{dispName}</h4>
          <div className="mt-1 grid grid-rows-3 grid-flow-col auto-cols-fr gap-1">
            <div className="w-full"><Stat label="HP"  v={player.base_stats?.hp} /></div>
            <div className="w-full"><Stat label="Atk" v={player.base_stats?.atk} /></div>
            <div className="w-full"><Stat label="Def" v={player.base_stats?.def} /></div>
            <div className="w-full"><Stat label="SpA" v={player.base_stats?.spa} /></div>
            <div className="w-full"><Stat label="SpD" v={player.base_stats?.spd} /></div>
            <div className="w-full"><Stat label="Spe" v={player.base_stats?.spe} /></div>
          </div>
        </div>

        {/* Actions */}
        <div className="row-[2] col-[1]">
          <button
            onClick={(e) => { e.stopPropagation(); onDraft(); }}
            disabled={!!disabledReason}
            className="w-full px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
            aria-label={disabledReason || (player.points != null ? `Draft ${dispName} for ${player.points} points` : `Draft ${dispName}`)}
            title={disabledReason || `Draft ${dispName}`}
          >
            {picked ? "Drafted" : "Draft"}
          </button>
        </div>

        <div className="row-[2] col-[2]">
          {!!player.abilities?.length && (
            <div className="text-[11px] leading-tight bg-black/30 backdrop-blur-sm rounded-md px-2 py-1">
              <span className="opacity-70">Abilities: </span>
              <span className="line-clamp-2">{player.abilities.join(", ")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EndOfDraftModal({
  open,
  onClose,
  onSaveToLeague,
  onPrint,
  onDelete,
  state,
}: {
  open: boolean;
  onClose: () => void;
  onSaveToLeague: (name: string) => Promise<void>;
  onPrint: () => void;
  onDelete: () => Promise<void>;
  state: StateResp | null;
}) {
  const [tab, setTab] = useState<"choose" | "save">("choose");
  const [leagueName, setLeagueName] = useState("");

  useEffect(() => {
    if (open) { setTab("choose"); setLeagueName(""); }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface-2 border border-white/10 p-4 text-white">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Draft Finished</h3>
          <button className="ml-auto px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15" onClick={onClose}>Close</button>
        </div>

        {tab === "choose" && (
          <>
            <p className="mt-2 text-sm opacity-80">
              Your draft has ended. What would you like to do?
            </p>
            <div className="mt-4 grid gap-3">
              <button
                className="px-4 py-3 rounded-xl text-left bg-success text-black hover:brightness-110"
                onClick={() => setTab("save")}
              >
                <div className="font-semibold">Save to a League</div>
                <div className="text-sm opacity-80">Create a league and turn these draft picks into team rosters.</div>
              </button>

              <button
                className="px-4 py-3 rounded-xl text-left bg-brand text-black hover:brightness-110"
                onClick={onPrint}
              >
                <div className="font-semibold">Print Draft Board</div>
                <div className="text-sm opacity-80">Open a print-friendly board that shows who drafted what.</div>
              </button>

              <button
                className="px-4 py-3 rounded-xl text-left bg-danger text-white hover:brightness-110"
                onClick={onDelete}
              >
                <div className="font-semibold">Delete Draft</div>
                <div className="text-sm opacity-80">Discard the room without saving team picks. This cannot be undone.</div>
              </button>
            </div>
          </>
        )}

        {tab === "save" && (
          <>
            <p className="mt-2 text-sm opacity-80">
              Name your league. All teams that participated in this draft will be added, and their picks become rostered players.
            </p>
            <div className="mt-3 grid gap-2">
              <label className="grid gap-1 text-sm">
                <span className="opacity-80">League name</span>
                <input
                  autoFocus
                  className="px-3 py-2 rounded-xl bg-white/10 outline-none"
                  placeholder={`e.g. ${new Date().getFullYear()} Season`}
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
                  disabled={!leagueName.trim()}
                  onClick={() => onSaveToLeague(leagueName.trim())}
                >
                  Save league
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15"
                  onClick={() => setTab("choose")}
                >
                  Back
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ========================================================
   Page
   ======================================================== */
export default function DraftRoomPage() {
  const r = useRouter();
  const params = useParams<{ id: string }>();
  const draftId = Number(params?.id);
  const FINALIZED_KEY = `draft:${draftId}:finalized`;
  const isMobile = useIsMobile();

  // auth guard
  useEffect(() => { if (!isLoggedIn()) r.push("/login"); }, [r]);

  // room state + actions
  const room = useDraftRoom(draftId);
  const { state, lobby, status, isCommish, msg, error, loading, myTeamId, teamLabel, userLabelByUserId } = room;

  // redirect non-commissioners when ended
  useEffect(() => {
    if (status === "ended" && !isCommish) {
      const dest = myTeamId ? `/teams?team=${myTeamId}` : "/teams";
      r.replace(dest);
    }
  }, [status, isCommish, myTeamId, r]);

  // local clock
  const remaining = useDraftClock(status, state);

  // player pool
  const pool = usePlayerPool(draftId, state);
  const {
    filters, setFilters, loadingPlayers, searchPlayers,
    playersById, sortedFilteredPlayers, draftedIds,
    watch, toggleWatch, watchedPlayers,
    flipped, toggleFlip, sheetFor, setSheetFor,
    viewMode, setViewMode,
    filtersCollapsed, setFiltersCollapsed, activeFilterCount,
  } = pool;

  // page-scoped UI state
  const [showOrderEditor, setShowOrderEditor] = useState(false);
  const [endedPromptOpen, setEndedPromptOpen] = useState(false);
  const [boardMode, setBoardMode] = useState<"all" | "mine">("all");
  useEffect(() => {
    const already = typeof window !== "undefined" && localStorage.getItem(FINALIZED_KEY) === "1";
    if (status === "ended") {
      if (isCommish && !already) setEndedPromptOpen(true);
      else setEndedPromptOpen(false);
    } else {
      setEndedPromptOpen(false);
    }
  }, [status, isCommish, draftId]);

  // Auto-scroll board
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boardRef.current?.scrollTo({ top: boardRef.current.scrollHeight, behavior: "smooth" });
  }, [state?.picks?.length]);

  const onClockTeamId = state?.next?.onClockTeamId ?? null;
  const isMyTurn =
    status === "active" &&
    onClockTeamId != null && myTeamId != null &&
    onClockTeamId === myTeamId;

  const turnRing =
    status === "active"
      ? (isMyTurn ? "ring-4 ring-emerald-400/70" : "ring-4 ring-red-400/50")
      : "";

  const boardPicks = (state?.picks ?? []).filter(p =>
    boardMode === "all" ? true : p.team_id === myTeamId
  );

  // Cap guard + Draft spam guard
  const cap = state?.draft.points_cap ?? null;
  const pointsOf = useCallback((id?: number | null) => {
    if (!id) return 0;
    const pc = playersById.get(id);
    return Number.isFinite(pc?.points as any) ? (pc!.points as number) : 0;
  }, [playersById]);

  const pointsUsed = useMemo(() => {
    if (!myTeamId) return 0;
    return (state?.picks ?? [])
      .filter(p => p.team_id === myTeamId)
      .reduce((s, p) => s + pointsOf(p.player_id), 0);
  }, [state?.picks, myTeamId, pointsOf]);

  const remainingCap = cap == null ? Infinity : Math.max(0, cap - pointsUsed);

  const [pickingId, setPickingId] = useState<number | null>(null);
  const draftOne = async (id: number) => {
    if (pickingId != null) return;
    if (cap != null) {
      const cost = pointsOf(id);
      if (cost > remainingCap) {
        room.setError(`Cap exceeded: need ${cost}, only ${remainingCap} left`);
        return;
      }
    }
    setPickingId(id);
    try { await room.makePick(id, myTeamId); }
    finally { setPickingId(null); }
  };

  // print board
  function printBoard() {
    try {
      const win = window.open("", "_blank");
      if (!win) throw new Error("Popup blocked. Allow popups to print.");
      const teamNameOf = (tid?: number | null) => teamLabel(tid);

      const picks = (state?.picks ?? []).map(p => {
        const pc = p.player_id != null ? playersById.get(p.player_id) : undefined;
        const baseName = pc?.base_name || (pc?.name ? extractBaseAndFormFromName(pc.name).base : "");
        const nameFmt = pc
          ? formatDisplayName(baseName || pc.name, pc?.form_label || null, pc?.gender || null)
          : (p.player_id != null ? `#${p.player_id}` : "—");
        return { round: p.round, overall: p.overall_pick, team: teamNameOf(p.team_id), name: nameFmt, types: pc?.types ?? [] };
      });

      const grouped: Record<number, typeof picks> = {};
      for (const row of picks) (grouped[row.round] ??= []).push(row);

      const html = `
<!doctype html><html>
<head>
<meta charset="utf-8"/>
<title>Draft Board #${draftId}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,Arial;margin:24px;color:#111}
  h1{margin:0 0 6px 0;font-size:20px}
  .meta{opacity:.7;margin-bottom:16px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ddd;padding:8px;font-size:13px}
  th{background:#f3f4f6;text-align:left}
  .types{opacity:.8;font-size:12px}
  @media print{ body{margin:0} tr.pagebreak { page-break-after: always; } }
</style>
</head>
<body>
  <h1>Draft Board</h1>
  <div class="meta">Draft #${draftId} • Type: ${(state?.draft.type || "").toUpperCase()} • Rounds: ${state?.draft.rounds ?? "—"}</div>
  <table>
    <thead>
      <tr><th>Overall</th><th>Round</th><th>Team</th><th>Player</th><th>Types</th></tr>
    </thead>
    <tbody>
      ${
        Object.keys(grouped).sort((a,b)=>Number(a)-Number(b)).map((rk, rIdx) => {
          const rows = grouped[Number(rk)];
          return `
            <tr><th colspan="5" style="background:#e5e7eb;text-align:center">Round ${rk}</th></tr>
            ${rows.map(row => `
              <tr>
                <td>${row.overall}</td>
                <td>${row.round}</td>
                <td>${row.team}</td>
                <td>${row.name}</td>
                <td class="types">${(row.types||[]).join(" / ")}</td>
              </tr>
            `).join("")}
            ${rIdx % 3 === 2 ? `<tr class="pagebreak"><td colspan="5"></td></tr>` : ``}
          `;
        }).join("")
      }
    </tbody>
  </table>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`;
      win.document.open(); win.document.write(html); win.document.close();
    } catch (e: any) {
      room.setError(e?.message ?? String(e));
    }
  }

  const myTeamPlayers = useMemo(() => {
    const mine = (state?.picks ?? []).filter(p => p.team_id === myTeamId);
    return mine
      .map(p => (p.player_id != null ? playersById.get(p.player_id) : undefined))
      .filter(Boolean) as PlayerCard[];
  }, [state?.picks, myTeamId, playersById]);

  // Prevent page scroll while mobile sheet is open
  useEffect(() => {
    if (sheetFor != null) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [sheetFor]);

  /* ------------------------ UI ------------------------ */
  return (
    <main className={`min-h-[calc(100vh-64px)] bg-surface text-white p-4 md:p-6 grid gap-4 rounded-3xl ${turnRing}`}>
      {/* Header */}
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Draft Room</h1>
        <span className="opacity-70 text-sm">#{draftId}</span>
        <span
          className={`ml-2 text-xs px-2 py-1 rounded-xl ${
            status === "active" ? "bg-success text-black"
            : status === "paused" ? "bg-secondary"
            : status === "ended" ? "bg-danger"
            : "bg-brand text-black"
          }`}
        >
          {status.toUpperCase()}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="text-xs px-3 py-1 rounded-lg bg-brand text-black hover:brightness-110"
            onClick={() => { room.loadState(); room.loadLobby(); }}
            aria-label="Refresh room"
          >
            Refresh
          </button>
          <button
            className="text-xs px-3 py-1 rounded-lg bg-danger hover:brightness-110"
            onClick={() => { logout(); r.push("/login"); }}
          >
            Log out
          </button>
        </div>
      </header>

      {/* Top: status + on clock + Watchlist */}
      <section className="grid gap-3 lg:grid-cols-[1.5fr,1fr]">
        {/* On the clock */}
        <div className="rounded-2xl p-4 bg-surface-2 border border-white/5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">On the clock</h2>
            {cap != null && (
              <span className="ml-auto text-xs px-2 py-1 rounded-lg bg-card text-black">
                Cap: {cap} • Left: {Number.isFinite(remainingCap) ? remainingCap : "—"}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-1 text-sm">
            <div>Round: <b>{state?.next?.round ?? "—"}</b></div>
            <div>Pick: <b>{state?.next?.overall ?? state?.picks?.length ?? 0}</b></div>
            <div>
              Team: <b>{state?.next?.onClockTeamId ? teamLabel(state?.next?.onClockTeamId) : userLabelByUserId(state?.next as any)}</b>
            </div>
            <div>Timer: <b>{state?.draft?.clock_seconds === 0 ? "Unlimited" : `${remaining}s`}</b></div>
          </div>

          {isCommish && (
            <div className="mt-4 flex flex-wrap gap-2">
              {status !== "active" && status !== "ended" && (
                <button
                  onClick={room.startDraft}
                  className="px-3 py-2 rounded-xl bg-success text-black hover:brightness-110 disabled:opacity-60"
                  disabled={loading || !(isCommish && status !== "ended" && (state?.order?.length ?? 0) >= 2)}
                  aria-label="Start draft"
                  title={!(isCommish && status !== "ended" && (state?.order?.length ?? 0) >= 2) ? "Set a draft order first" : "Start draft"}
                >Start</button>
              )}
              {status === "active" && (
                <button
                  onClick={room.pauseDraft}
                  className="px-3 py-2 rounded-xl bg-secondary text-white hover:brightness-110 disabled:opacity-60"
                  disabled={loading}
                >Pause</button>
              )}
              {status !== "ended" && (
                <button
                  onClick={room.endDraft}
                  className="px-3 py-2 rounded-xl bg-danger text-white hover:brightness-110 disabled:opacity-60"
                  disabled={loading}
                >End</button>
              )}
              <button
                onClick={() => setShowOrderEditor(true)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-60"
                disabled={loading}
                title="Set draft order"
              >Set order</button>
              <button
                onClick={room.undoLast}
                className="px-3 py-2 rounded-xl bg-secondary-light text-white hover:brightness-110 disabled:opacity-60"
                disabled={loading}
              >Undo last</button>
            </div>
          )}
          {(msg || error) && (
            <p className={`mt-2 text-sm ${error ? "text-red-400" : "text-white/80"}`} aria-live="polite">
              {error || msg}
            </p>
          )}
        </div>

        {/* Settings & Presence + Watchlist */}
        <div className="grid gap-3">
          <div className="rounded-2xl p-4 bg-card text-black">
            <h3 className="text-lg font-semibold">Room</h3>
            <div className="mt-2 text-sm">
              <div>Status: <b>{status}</b></div>
              <div>Type: <b>{state?.draft?.type}</b> • Rounds: <b>{state?.draft?.rounds}</b></div>
              <div>Teams in order: <b>{state?.order?.length ?? 0}</b></div>
            </div>
            {isCommish && (
              <SettingsPanel draft={state?.draft} onSave={room.saveSettings} disabled={loading || status === "ended"} />
            )}
            <div className="mt-3">
              <PresenceList presence={lobby?.presence ?? []} participants={lobby?.participants ?? []} />
            </div>
          </div>

          {/* Watchlist + Coverage (split) */}
          <div className="rounded-2xl p-4 bg-surface-2 border border-white/5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Watchlist & Coverage</h3>
              <span className="ml-auto text-xs opacity-75">{watchedPlayers.length} saved</span>
            </div>

            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {/* LEFT: Watchlist */}
              <div className="rounded-2xl p-3 bg-black/30 border border-white/5 max-h-[28vh] overflow-auto pr-1">
                {watchedPlayers.length === 0 && (
                  <div className="opacity-70 text-sm">No watched players yet. Click ★ on a card to add.</div>
                )}
                <div className="grid gap-2">
                  {watchedPlayers.map((p) => {
                    const picked = draftedIds.has(p.id ?? -1);
                    const baseName = p.base_name || extractBaseAndFormFromName(p.name).base;
                    const dispName = formatDisplayName(baseName, p.form_label, p.gender);
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 rounded-xl px-2 py-2 border ${
                          picked ? "opacity-60 bg-black/10 border-white/10" : "bg-black/30 border-white/5"
                        }`}
                      >
                        <div className="relative h-10 w-10 rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                          <Sprite
                            slug={p.slug}
                            baseName={p.base_name || baseFromSlug(p.slug)}
                            formIndex={p.form_index ?? null}
                            gender={p.gender ?? undefined}
                            alt={dispName}
                            className="absolute inset-0 m-auto w-[85%] h-[85%] object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{dispName}</div>
                          <div className="text-[11px] opacity-70 truncate">{(p.types ?? []).join(" / ")}</div>
                        </div>
                        {picked ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-brand text-black">Drafted</span>
                        ) : (
                          <button
                            className="text-xs px-2 py-1 rounded-md bg-secondary text-white hover:brightness-110"
                            onClick={() => p.id && draftOne(p.id)}
                            disabled={!isMyTurn || !p.id || pickingId === p.id}
                            title={isMyTurn ? `Draft ${dispName}` : "Not your turn"}
                          >
                            Draft
                          </button>
                        )}
                        <button
                          className="text-lg px-2"
                          title="Remove from watchlist"
                          onClick={() => toggleWatch(p.id)}
                          aria-label={`Remove ${dispName} from watchlist`}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Coverage */}
              <CoveragePanel myTeamPlayers={myTeamPlayers} />
            </div>
          </div>
        </div>
      </section>

      {/* Middle: order + picks board */}
      <section className="grid gap-3 md:grid-cols-[1fr,2fr]">
        <div className="rounded-2xl p-4 bg-surface-2 border border-white/5">
          <h3 className="text-lg font-semibold">Draft order</h3>
          <ol className="mt-2 grid gap-1 text-sm">
            {state?.order?.length ? (
              state.order.map((o: OrderRow) => (
                <li
                  key={o.slot}
                  className={`px-3 py-2 rounded-xl ${
                    state?.next?.slot === o.slot ? "bg-brand text-black" : "bg-black/30 border border-white/5"
                  }`}
                >
                  <span className="opacity-70 mr-2">#{o.slot}</span>
                  {teamLabel(o.team_id)}
                </li>
              ))
            ) : (
              <p className="opacity-80">Order not set</p>
            )}
          </ol>
        </div>

        {/* BOARD */}
        <div className="rounded-2xl p-4 bg-surface-2 border border-white/5">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Board</h3>
            <div className="ml-auto rounded-xl bg-white/10 p-1">
              <button
                className={`px-3 py-1 rounded-lg text-sm ${boardMode === "all" ? "bg-secondary text-white" : "text-white/80 hover:bg-white/15"}`}
                onClick={() => setBoardMode("all")}
                aria-pressed={boardMode === "all"}
              >
                All picks
              </button>
              <button
                className={`ml-1 px-3 py-1 rounded-lg text-sm ${boardMode === "mine" ? "bg-secondary text-white" : "text-white/80 hover:bg-white/15"}`}
                onClick={() => setBoardMode("mine")}
                aria-pressed={boardMode === "mine"}
              >
                My team
              </button>
            </div>
          </div>

          <div
            ref={boardRef}
            className="mt-2 max-h-[60vh] overflow-auto pr-1
                       grid gap-3
                       [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]"
          >
            {boardPicks.length ? (
              boardPicks.map((p: PickRow) => {
                const pc = p.player_id != null ? playersById.get(p.player_id) : undefined;
                const baseName = pc?.base_name || (pc?.name ? extractBaseAndFormFromName(pc.name).base : "");
                const formLabel = pc?.form_label || null;
                const gender = pc?.gender || null;
                const nameFmt = pc
                  ? formatDisplayName(baseName || pc.name, formLabel, gender)
                  : (p.player_id != null ? `#${p.player_id}` : "—");
                const slug = pc?.slug ?? "";
                const types = pc?.types ?? [];

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl bg-black/30 border border-white/5 p-2"
                    title={`${nameFmt} • ${teamLabel(p.team_id)}`}
                  >
                    <div className="relative aspect-square w-full rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="absolute top-1 left-1 flex gap-1">
                        {types.map((t) => <TypeBadge key={t} t={t} />)}
                      </div>

                      {slug ? (
                        <Sprite
                          slug={slug}
                          baseName={baseName}
                          formIndex={pc?.form_index ?? null}
                          gender={gender ?? undefined}
                          alt={nameFmt}
                          className="absolute inset-0 m-auto w-[80%] h-[80%] object-contain"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-[10px] opacity-60">—</div>
                      )}

                      <div className="absolute bottom-1 left-1 right-1">
                        <div className="px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-[12px] font-semibold">
                          <span className="block truncate">{nameFmt}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs opacity-70 shrink-0">R{p.round} • #{p.overall_pick}</span>
                      <span className="font-medium truncate" title={teamLabel(p.team_id)}>{teamLabel(p.team_id)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="opacity-80">
                {boardMode === "mine" ? "No picks for your team yet." : "No picks yet."}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Bottom: Pokémon search + pick */}
      <section className="rounded-2xl p-4 bg-surface-2 border border-white/5">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Pokémon pool</h3>
          <button
            className="ml-auto px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110 disabled:opacity-60"
            onClick={searchPlayers}
            disabled={loadingPlayers}
          >
            {loadingPlayers ? "Searching…" : "Refresh list"}
          </button>
          <button
            className="px-3 py-2 rounded-xl bg-white/10 text-white hover:bg-white/15"
            onClick={() => setFiltersCollapsed(v => !v)}
            aria-controls="pool-filters"
            aria-expanded={!filtersCollapsed}
            title={filtersCollapsed ? "Show filters" : "Hide filters"}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-brand text-black">
                {activeFilterCount}
              </span>
            )}
            <span className="ml-1">{filtersCollapsed ? "▸" : "▾"}</span>
          </button>

          {/* View toggle */}
          <div className="items-center rounded-xl bg-white/10 p-1">
            <button
              className={`px-3 py-1 rounded-lg text-sm ${viewMode === "flip" ? "bg-secondary text-white" : "text-white/80 hover:bg-white/15"}`}
              onClick={() => setViewMode("flip")}
              aria-pressed={viewMode === "flip"}
            >
              Flip
            </button>
            <button
              className={`ml-1 px-3 py-1 rounded-lg text-sm ${viewMode === "classic" ? "bg-secondary text-white" : "text-white/80 hover:bg-white/15"}`}
              onClick={() => setViewMode("classic")}
              aria-pressed={viewMode === "classic"}
            >
              Classic
            </button>
          </div>
        </div>

        <div className="mt-3">
          <AnimatePresence initial={false}>
            {!filtersCollapsed && (
              <motion.div
                id="pool-filters"
                key="pool-filters"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
                className="sticky top-2 z-10 overflow-hidden"
              >
                <Filters filters={filters} onChange={setFilters} onSearch={searchPlayers} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className={`mt-3 grid gap-3 ${
            viewMode === "flip"
              ? "[grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]"
              : "[grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]"
          }`}
        >
          {sortedFilteredPlayers.map((p) => {
            const picked = draftedIds.has(p.id ?? -1);
            const baseName = p.base_name || extractBaseAndFormFromName(p.name).base;
            const dispName = formatDisplayName(baseName, p.form_label, p.gender);
            const disabledReason =
              picked ? "Already drafted"
              : status !== "active" ? "Draft is not active"
              : !(state?.next?.onClockTeamId && myTeamId && state.next.onClockTeamId === myTeamId) ? "Not your turn"
              : !p.id ? "Invalid player" : "";
            const watched = watch.has(p.id ?? -1);
            const flippedNow = p.id != null && flipped.has(p.id);

            return viewMode === "flip" ? (
              <PlayerCardFlip
                key={p.id ?? p.slug}
                player={p}
                dispName={dispName}
                picked={picked}
                watched={watched}
                disabledReason={disabledReason}
                onToggleWatch={(e) => { e.stopPropagation(); toggleWatch(p.id); }}
                onDraft={(e) => { e.stopPropagation(); if (p.id) draftOne(p.id); }}
                onFlip={() => isMobile ? setSheetFor(p.id ?? null) : toggleFlip(p.id)}
                flipped={!!flippedNow}
              />
            ) : (
              <PlayerCardClassic
                key={p.id ?? p.slug}
                player={p}
                dispName={dispName}
                picked={picked}
                watched={watched}
                disabledReason={disabledReason}
                onToggleWatch={() => toggleWatch(p.id)}
                onDraft={() => p.id && draftOne(p.id)}
              />
            );
          })}
        </div>
      </section>

      {/* Order editor (commissioner only) */}
      {isCommish && showOrderEditor && (
        <OrderEditor
          participants={lobby?.participants ?? []}
          currentOrder={(state?.order ?? []).map((o) => o.team_id)}
          onClose={() => setShowOrderEditor(false)}
          onSave={async (seq) => { await room.saveOrder(seq); setShowOrderEditor(false); }}
        />
      )}

      {/* Mobile bottom sheet for card details */}
      <DetailsSheet
        open={sheetFor != null}
        player={sheetFor != null ? playersById.get(sheetFor) : null}
        onClose={() => setSheetFor(null)}
        onDraft={(id) => id && draftOne(id)}
        watched={sheetFor != null ? watch.has(sheetFor) : false}
        onToggleWatch={(id) => toggleWatch(id)}
        isMyTurn={isMyTurn}
      />

      {/* End-of-draft options (commissioner) */}
      <EndOfDraftModal
        open={endedPromptOpen}
        onClose={() => setEndedPromptOpen(false)}
        onSaveToLeague={async (name) => {
          await room.createLeagueFromDraft(name);
          try { localStorage.setItem(FINALIZED_KEY, "1"); } catch {}
          setEndedPromptOpen(false);
        }}
        onPrint={printBoard}
        onDelete={async () => {
          if (!confirm("Are you sure you want to delete this draft? This will NOT save any team picks.")) return;
          await room.deleteDraft();
        }}
        state={state}
      />
    </main>
  );
}
