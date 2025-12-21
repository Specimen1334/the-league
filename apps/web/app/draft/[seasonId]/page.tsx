"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiFetchJson, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { TYPES, TYPE_COLORS, defenseSummary, normalizeType } from "@/lib/pokemon-types";

type LeagueRole = "owner" | "commissioner" | "member" | string;

type SeasonOverviewResponse = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    status: string;
  };
};


type SeasonSettingsResponse = {
  seasonId: number;
  settings: {
    draftPointCap: number;
    allowTrades: boolean;
    tradeDeadlineAt: string | null;
  };
};

// API: GET /leagues/:leagueId returns LeagueDetail (flat), not nested under { league: ... }
type LeagueDetailResponse = {
  id: number;
  name: string;
  myRole: LeagueRole | null;
};

type DraftStatus = "NotStarted" | "Lobby" | "InProgress" | "Paused" | "Completed";
type DraftType = "Snake" | "Linear" | "Custom";

type DraftLobbyParticipant = {
  teamId: number;
  teamName: string;
  managerUserId: number;
  managerDisplayName: string | null;
  position: number;
  isReady: boolean;
  isYou: boolean;
};

type DraftLobbyResponse = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;
  startsAt: string | null;
  pickTimerSeconds: number | null;
  roundCount: number | null;
  participants: DraftLobbyParticipant[];
};

type DraftStateResponse = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;
  currentRound: number;
  currentPickInRound: number;
  overallPickNumber: number;
  totalTeams: number;
  teamOnTheClock: { teamId: number; teamName: string } | null;
  timer: { pickTimerSeconds: number | null };
  picks: {
    id: number;
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    teamId: number;
    teamName: string | null;
    pokemonId: number;
    pokemonName: string | null;
    spriteUrl: string | null;
  }[];
};

type BaseStats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };

type DraftPoolItem = {
  pokemonId: number;
  dexNumber: number | null;
  name: string;
  spriteUrl: string | null;
  baseStats: BaseStats | null;
  types: string[];
  roles: string[];
  baseCost: number | null;
  isPicked: boolean;
  pickedByTeamId: number | null;
};

type DraftPoolResponse = {
  seasonId: number;
  items: DraftPoolItem[];
  page: number;
  limit: number;
  total: number;
};

type DraftPokemonDetails = Pick<
  DraftPoolItem,
  "pokemonId" | "dexNumber" | "name" | "spriteUrl" | "baseStats" | "types" | "roles" | "baseCost"
>;

type MyDraftResponse = {
  seasonId: number;
  teamId: number;
  teamName: string;
  picks: {
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    pokemonId: number;
  }[];
  roster: DraftPokemonDetails[];
  watchlistPokemonIds: number[];
};

type AdminDraftSettings = {
  type: DraftType;
  pickTimerSeconds: number | null;
  roundCount: number | null;
  startsAt: string | null;
  draftPointCap: number;
};

function statusBadge(status: DraftStatus): { label: string; className: string } {
  switch (status) {
    case "NotStarted":
      return { label: "Not started", className: "badge badge-soft" };
    case "Lobby":
      return { label: "Lobby", className: "badge badge-outline" };
    case "InProgress":
      return { label: "In progress", className: "badge badge-success" };
    case "Paused":
      return { label: "Paused", className: "badge badge-warn" };
    case "Completed":
      return { label: "Completed", className: "badge badge-soft" };
    default:
      return { label: status, className: "badge badge-soft" };
  }
}

function isServerErrorFromApi(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 500;
}

function TypePill({ t, dimmed = false }: { t: string; dimmed?: boolean }) {
  const nt = normalizeType(t);
  const bg = nt ? TYPE_COLORS[nt] : undefined;

  // Ensure readable text against the type color.
  const textColor = useMemo(() => {
    if (!bg) return undefined;
    const hex = bg.replace("#", "");
    if (hex.length !== 6) return undefined;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.62 ? "#111827" : "#ffffff";
  }, [bg]);

  return (
    <span
      className="badge badge-outline"
      style={
        bg
          ? {
              backgroundColor: bg,
              borderColor: bg,
              color: textColor,
              opacity: dimmed ? 0.35 : 1
            }
          : undefined
      }
    >
      {nt ?? t}
    </span>
  );
}

function StatLine({ label, v }: { label: string; v: number | null | undefined }) {
  const val = typeof v === "number" ? v : 0;
  return (
    <div className="draft-stat-row">
      <span className="draft-stat-label">{label}</span>
      <span className="draft-stat-val">{val}</span>
    </div>
  );
}

function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpointPx]);
  return isMobile;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore
  }
}

export default function DraftHubPage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = Number(params?.seasonId);

  const toast = useToast();
  const auth = useAuth();

  // Note: auth gating is handled globally in the new app.

  // Presence heartbeat (keeps an "online" list like the old room).
  useEffect(() => {
    if (!auth.user) {
      setOnlineUserIds([]);
      return;
    }
    if (!Number.isFinite(seasonId) || seasonId <= 0) {
      setOnlineUserIds([]);
      return;
    }

    let alive = true;
    let t: ReturnType<typeof setTimeout> | null = null;

    const beat = async () => {
      try {
        const res = await apiFetchJson<{ onlineUserIds: number[] }>(`/seasons/${seasonId}/draft/presence`, {
          method: "POST"
        });
        if (alive) setOnlineUserIds(Array.isArray(res.onlineUserIds) ? res.onlineUserIds : []);
      } catch {
        // ignore transient errors
      } finally {
        if (!alive) return;
        t = setTimeout(beat, 5000);
      }
    };

    void beat();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [auth.user, seasonId]);

  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [seasonName, setSeasonName] = useState<string | null>(null);

  const [lobby, setLobby] = useState<DraftLobbyResponse | null>(null);
  const [state, setState] = useState<DraftStateResponse | null>(null);
  const [pool, setPool] = useState<DraftPoolResponse | null>(null);
  const [my, setMy] = useState<MyDraftResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // presence
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);

  // pool filters (parity with old draft room where possible)
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [minPoints, setMinPoints] = useState<string>("");
  const [maxPoints, setMaxPoints] = useState<string>("");
  const [hideDrafted, setHideDrafted] = useState(true);
  const [sortKey, setSortKey] = useState<"name" | "dex" | "pts" | "hp" | "atk" | "def" | "spa" | "spd" | "spe">("dex");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showMode, setShowMode] = useState<"available" | "drafted" | "mine" | "watchlist">("available");

  // card view (classic vs flip) + per-card flip state
  const VIEW_KEY = useMemo(() => `draft:${seasonId}:viewMode`, [seasonId]);
  const [viewMode, setViewMode] = useState<"classic" | "flip">("classic");
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [sheetFor, setSheetFor] = useState<DraftPoolItem | null>(null);
  const [sheetSide, setSheetSide] = useState<"front" | "back">("front");
  const isMobile = useIsMobile();

  // board filter (helps mimic old room's "board" focus)
  const [boardMode, setBoardMode] = useState<"all" | "mine">("all");
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  // board style
  const [boardStyle, setBoardStyle] = useState<"grid" | "table">("grid");

  // analyzer
  const [analyserMode, setAnalyserMode] = useState<"coverage" | "defense">("coverage");

  // modals
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false);
  const [forcePickOpen, setForcePickOpen] = useState(false);

  // commissioner action state
  const [adminBusy, setAdminBusy] = useState<null | "start" | "pause" | "resume" | "end" | "undo" | "force">(null);
  const [forcePickTeamId, setForcePickTeamId] = useState<number | "">("");
  const [forcePickPokemonId, setForcePickPokemonId] = useState<number | "">("");

  // join team (when user has no team yet)
  const [joinTeamName, setJoinTeamName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  // reroll order (commissioner)
  const [rerollBusy, setRerollBusy] = useState(false);

  // commissioner draft settings
  const [settings, setSettings] = useState<AdminDraftSettings>({
    type: "Snake",
    pickTimerSeconds: 60,
    roundCount: null,
    startsAt: null,
    draftPointCap: 0
  });
  const [settingsBusy, setSettingsBusy] = useState(false);
  const settingsTouched = useRef(false);

  const canManage = myRole === "owner" || myRole === "commissioner";
  const settingsLocked = lobby?.status === "InProgress" || lobby?.status === "Paused" || lobby?.status === "Completed";
  const canEditSettings = canManage && !settingsLocked;

  const youParticipant = useMemo(() => lobby?.participants.find((p) => p.isYou) ?? null, [lobby?.participants]);

  const isYourTurn = useMemo(() => {
    if (!state?.teamOnTheClock || !youParticipant) return false;
    return state.teamOnTheClock.teamId === youParticipant.teamId;
  }, [state?.teamOnTheClock, youParticipant]);

  const watchlistSet = useMemo(() => new Set<number>(my?.watchlistPokemonIds ?? []), [my?.watchlistPokemonIds]);

  const teamNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of lobby?.participants ?? []) m.set(p.teamId, p.teamName);
    return m;
  }, [lobby?.participants]);

  const allReady = useMemo(() => {
    const parts = lobby?.participants ?? [];
    return parts.length > 0 && parts.every((p) => p.isReady);
  }, [lobby?.participants]);

  const canStartDraft = useMemo(() => {
    if (!canManage) return false;
    if (!lobby) return false;
    if (lobby.status !== "Lobby" && lobby.status !== "NotStarted") return false;
    const roundsOk = typeof lobby.roundCount === "number" && lobby.roundCount >= 1;
    const timerOk = typeof lobby.pickTimerSeconds === "number" && lobby.pickTimerSeconds >= 5;
    return roundsOk && timerOk && allReady;
  }, [allReady, canManage, lobby]);

	// season-level settings (e.g. draft point cap)
	const [seasonSettings, setSeasonSettings] = useState<SeasonSettingsResponse | null>(null);

	const loadSeasonSettings = useCallback(async () => {
		const res = await apiFetchJson<SeasonSettingsResponse>(`/seasons/${seasonId}/settings`);
		setSeasonSettings(res);
		return res;
	}, [seasonId]);

  // init settings from lobby snapshot
  useEffect(() => {
    if (!lobby || settingsTouched.current) return;
    setSettings({
      type: lobby.type,
      pickTimerSeconds: lobby.pickTimerSeconds,
      roundCount: lobby.roundCount,
      startsAt: lobby.startsAt,
      // season-scoped setting
      draftPointCap: seasonSettings?.settings.draftPointCap ?? 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby, seasonSettings]);

	// metadata

	useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      if (!Number.isFinite(seasonId) || seasonId <= 0) return;
      try {
        const ov = await apiFetchJson<SeasonOverviewResponse>(`/seasons/${seasonId}`);
        if (cancelled) return;
        setSeasonName(ov.season.name);
        setLeagueId(ov.season.leagueId);

				// load season settings in parallel with other metadata so draft UI reflects server truth
				// (notably: draftPointCap)
				await loadSeasonSettings();

        if (ov.season.leagueId) {
          const lv = await apiFetchJson<LeagueDetailResponse>(`/leagues/${ov.season.leagueId}`);
          if (cancelled) return;
          setLeagueName(lv.name);
          setMyRole(lv.myRole);
        } else {
          setLeagueName(null);
          setMyRole(null);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load season");
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [seasonId, loadSeasonSettings]);

  const loadLobby = useCallback(async () => {
    const res = await apiFetchJson<DraftLobbyResponse>(`/seasons/${seasonId}/draft/lobby`);
    setLobby(res);
    return res;
  }, [seasonId]);

  const loadState = useCallback(async () => {
    const res = await apiFetchJson<DraftStateResponse>(`/seasons/${seasonId}/draft/state`);
    setState(res);
    return res;
  }, [seasonId]);

  const loadMy = useCallback(async () => {
    const res = await apiFetchJson<MyDraftResponse>(`/seasons/${seasonId}/draft/my`);
    setMy(res);
    return res;
  }, [seasonId]);

  const loadPool = useCallback(async () => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set("search", search.trim());
    if (typeFilter.trim()) qs.set("type", typeFilter.trim());
    if (roleFilter.trim()) qs.set("role", roleFilter.trim());

    // We fetch a large list and do show-mode filtering client-side for snappy toggles.
    qs.set("page", "1");
    qs.set("limit", "1000");
    // Always fetch all so the UI can fully match old behavior (hide/show drafted client-side)
    // and so the board can look up types for drafted picks.
    qs.set("onlyAvailable", "false");

    const url = `/seasons/${seasonId}/draft/pool?${qs.toString()}`;
    const res = await apiFetchJson<DraftPoolResponse>(url);
    setPool(res);
    return res;
  }, [roleFilter, search, seasonId, showMode, typeFilter]);

  // restore view mode
  useEffect(() => {
    if (!Number.isFinite(seasonId) || seasonId <= 0) return;
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw === "flip" || raw === "classic") setViewMode(raw);
    } catch {
      // ignore
    }
  }, [VIEW_KEY, seasonId]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [VIEW_KEY, viewMode]);

  // scroll lock when sheet open
  useEffect(() => {
    if (!sheetFor) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetFor]);

  // initial load
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      if (!Number.isFinite(seasonId) || seasonId <= 0) return;
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadLobby(), loadState(), loadMy(), loadPool(), loadSeasonSettings()]);
        if (cancelled) return;
      } catch (e) {
        if (cancelled) return;
        if (isServerErrorFromApi(e)) {
          setError("Server error while loading draft. Check API logs.");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load draft");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [loadLobby, loadMy, loadPool, loadState, seasonId]);

  // Auto-scroll the full board to the latest pick.
  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    // Allow the DOM to paint first.
    const id = window.setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => window.clearTimeout(id);
  }, [state?.picks?.length]);

  // SSE live updates (auto-retry like the old draft room)
  useEffect(() => {
    if (!Number.isFinite(seasonId) || seasonId <= 0) return;

    let alive = true;
    let es: EventSource | null = null;
    let retry = 0;
    let t: ReturnType<typeof setTimeout> | null = null;

    const onAny = async () => {
      try {
        await Promise.all([loadLobby(), loadState(), loadMy(), loadPool(), loadSeasonSettings()]);
      } catch {
        // ignore transient reconnect failures
      }
    };

    const connect = () => {
      if (!alive) return;
      if (t) {
        clearTimeout(t);
        t = null;
      }

      es?.close();
      es = new EventSource(`/api/seasons/${seasonId}/draft/stream`);

      es.addEventListener("message", onAny);
      es.addEventListener("draft:lobby", onAny as any);
      es.addEventListener("draft:state", onAny as any);
      es.addEventListener("draft:pool", onAny as any);
      es.addEventListener("draft:presence", onAny as any);

      es.onopen = () => {
        retry = 0;
      };

      es.onerror = () => {
        es?.close();
        if (!alive) return;
        const delay = Math.min(15000, 1000 * Math.pow(2, retry++));
        t = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      alive = false;
      if (t) clearTimeout(t);
      es?.close();
    };
  }, [loadLobby, loadMy, loadPool, loadState, seasonId]);

  // derived lists
  const items = useMemo(() => {
    const base = pool?.items ?? [];
    let list = base;

    // old: hide drafted toggle (applies unless you explicitly view drafted)
    if (hideDrafted && showMode !== "drafted") {
      list = list.filter((x) => !x.isPicked);
    }

    if (showMode === "drafted") {
      list = list.filter((x) => x.isPicked);
    } else if (showMode === "mine") {
      const myTeamId = my?.teamId;
      list = list.filter((x) => x.pickedByTeamId != null && x.pickedByTeamId === myTeamId);
    } else if (showMode === "watchlist") {
      list = list.filter((x) => watchlistSet.has(x.pokemonId) && !x.isPicked);
    }

    const minP = minPoints.trim() === "" ? -Infinity : Number(minPoints);
    const maxP = maxPoints.trim() === "" ? Infinity : Number(maxPoints);
    if (minPoints.trim() !== "" || maxPoints.trim() !== "") {
      list = list.filter((x) => {
        const pts = x.baseCost ?? NaN;
        return Number.isFinite(pts) && pts >= minP && pts <= maxP;
      });
    }

    const sorted = [...list];
    const dir = sortDir === "asc" ? 1 : -1;
    const stat = (p: DraftPoolItem, k: typeof sortKey): number => {
      if (k === "name") return 0;
      if (k === "dex") return p.dexNumber ?? 9999;
      if (k === "pts") return p.baseCost ?? 9999;
      const s = p.baseStats;
      if (!s) return 0;
      if (k === "hp") return s.hp;
      if (k === "atk") return s.atk;
      if (k === "def") return s.def;
      if (k === "spa") return s.spa;
      if (k === "spd") return s.spd;
      return s.spe;
    };
    sorted.sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      const av = stat(a, sortKey);
      const bv = stat(b, sortKey);
      if (av !== bv) return dir * (av - bv);
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [hideDrafted, maxPoints, minPoints, my?.teamId, pool?.items, showMode, sortDir, sortKey, watchlistSet]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    if (typeFilter.trim()) n++;
    if (roleFilter.trim()) n++;
    if (minPoints.trim()) n++;
    if (maxPoints.trim()) n++;
    if (!hideDrafted) n++;
    return n;
  }, [hideDrafted, maxPoints, minPoints, roleFilter, search, typeFilter]);

  const draftedIds = useMemo(() => new Set<number>(state?.picks.map((p) => p.pokemonId) ?? []), [state?.picks]);

  const rosterTypes = useMemo(() => (my?.roster ?? []).map((p) => p.types ?? []), [my?.roster]);
  const rosterTypeSet = useMemo(() => {
  const s = new Set<string>();
  for (const ts of rosterTypes) {
    for (const t of ts) {
      const nt = normalizeType(t);
      if (nt) s.add(nt);
    }
  }
  return s;
}, [rosterTypes]);

  const defSummary = useMemo(() => defenseSummary(rosterTypes), [rosterTypes]);

  // actions
  const toggleReady = useCallback(async () => {
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/ready`, { method: "POST" });
      await loadLobby();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle ready");
    }
  }, [loadLobby, seasonId, toast]);

  const updateWatchlist = useCallback(
    async (nextSet: Set<number>) => {
      try {
        const ids = Array.from(nextSet);
        await apiFetchJson(`/seasons/${seasonId}/draft/watchlist`, {
          method: "POST",
          body: JSON.stringify({ pokemonIds: ids })
        });
        await loadMy();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update watchlist");
        return false;
      }
    },
    [loadMy, seasonId, toast]
  );

  const onToggleWatch = useCallback(
    async (pokemonId: number) => {
      const next = new Set(watchlistSet);
      if (next.has(pokemonId)) next.delete(pokemonId);
      else next.add(pokemonId);
      await updateWatchlist(next);
    },
    [updateWatchlist, watchlistSet]
  );

  const makePick = useCallback(
    async (pokemonId: number) => {
      try {
        await apiFetchJson(`/seasons/${seasonId}/draft/pick`, {
          method: "POST",
          body: JSON.stringify({ pokemonId })
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Pick failed");
      }
    },
    [seasonId, toast]
  );

  const joinTeam = useCallback(async () => {
    if (!joinTeamName.trim()) return;
    setJoinBusy(true);
    try {
      await apiFetchJson(`/seasons/${seasonId}/teams/join`, {
        method: "POST",
        body: JSON.stringify({ name: joinTeamName.trim() })
      });
      setJoinTeamName("");
      await Promise.all([loadLobby(), loadMy()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setJoinBusy(false);
    }
  }, [joinTeamName, loadLobby, loadMy, seasonId, toast]);

  // commissioner actions
  const adminUpdateSettings = useCallback(async () => {
    if (!canEditSettings) return;
    setSettingsBusy(true);
    try {
      settingsTouched.current = true;
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          type: settings.type,
          startsAt: settings.startsAt,
          pickTimerSeconds: settings.pickTimerSeconds,
          roundCount: settings.roundCount
        })
      });
      // draftPointCap is season-scoped (not draft-session-scoped)
      if ((seasonSettings?.settings.draftPointCap ?? 0) !== settings.draftPointCap) {
        await apiFetchJson(`/seasons/${seasonId}/settings`, {
          method: "PATCH",
          body: JSON.stringify({ draftPointCap: settings.draftPointCap })
        });
        await loadSeasonSettings();
      }
      toast.success("Draft settings saved");
      await loadLobby();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update settings");
    } finally {
      setSettingsBusy(false);
    }
  }, [canEditSettings, loadLobby, loadSeasonSettings, seasonId, seasonSettings, settings, toast]);

  const adminReroll = useCallback(async () => {
    if (!canEditSettings) return;
    setRerollBusy(true);
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/reroll-order`, { method: "POST" });
      await loadLobby();
      toast.success("Draft order rerolled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reroll failed");
    } finally {
      setRerollBusy(false);
    }
  }, [canEditSettings, loadLobby, seasonId, toast]);

  const adminStart = useCallback(async () => {
    setAdminBusy("start");
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/start`, { method: "POST" });
      await Promise.all([loadLobby(), loadState()]);
      toast.success("Draft started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    } finally {
      setAdminBusy(null);
    }
  }, [loadLobby, loadState, seasonId, toast]);

  const adminPause = useCallback(async () => {
    setAdminBusy("pause");
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/pause`, { method: "POST" });
      await Promise.all([loadLobby(), loadState()]);
      toast.success("Draft paused");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pause failed");
    } finally {
      setAdminBusy(null);
    }
  }, [loadLobby, loadState, seasonId, toast]);

  const adminResume = useCallback(async () => {
    setAdminBusy("resume");
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/resume`, { method: "POST" });
      await Promise.all([loadLobby(), loadState()]);
      toast.success("Draft resumed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resume failed");
    } finally {
      setAdminBusy(null);
    }
  }, [loadLobby, loadState, seasonId, toast]);

  const adminEnd = useCallback(async () => {
    setAdminBusy("end");
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/end`, { method: "POST" });
      await Promise.all([loadLobby(), loadState()]);
      toast.success("Draft ended");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "End failed");
    } finally {
      setAdminBusy(null);
    }
  }, [loadLobby, loadState, seasonId, toast]);

  const adminUndo = useCallback(async () => {
    setAdminBusy("undo");
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/undo-last`, { method: "POST" });
      await Promise.all([loadState(), loadMy(), loadPool()]);
      toast.success("Undid last pick");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setAdminBusy(null);
    }
  }, [loadMy, loadPool, loadState, seasonId, toast]);

  const adminForce = useCallback(async () => {
    if (forcePickPokemonId === "") return;
    setAdminBusy("force");
    try {
      await apiFetchJson(`/seasons/${seasonId}/draft/admin/force-pick`, {
        method: "POST",
        body: JSON.stringify({
          pokemonId: forcePickPokemonId,
          teamId: forcePickTeamId === "" ? undefined : forcePickTeamId
        })
      });
      setForcePickOpen(false);
      setForcePickPokemonId("");
      setForcePickTeamId("");
      await Promise.all([loadState(), loadMy(), loadPool()]);
      toast.success("Force pick applied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Force pick failed");
    } finally {
      setAdminBusy(null);
    }
  }, [forcePickPokemonId, forcePickTeamId, loadMy, loadPool, loadState, seasonId, toast]);

  const poolById = useMemo(() => {
    const m = new Map<number, DraftPoolItem>();
    for (const it of pool?.items ?? []) m.set(it.pokemonId, it);
    return m;
  }, [pool?.items]);

  const toggleFlip = useCallback((pokemonId: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(pokemonId)) next.delete(pokemonId);
      else next.add(pokemonId);
      return next;
    });
  }, []);

  const openDetails = useCallback(
    (p: DraftPoolItem) => {
      if (viewMode !== "flip") return;
      if (isMobile) {
        setSheetSide("front");
        setSheetFor(p);
        return;
      }
      toggleFlip(p.pokemonId);
    },
    [isMobile, toggleFlip, viewMode]
  );

  if (loading) {
    return (
      <div className="stack stack-lg">
        <PageHeader title="Draft" subtitle="Loading…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="stack stack-lg">
        <PageHeader title="Draft" subtitle="Error" />
        <div className="card p-4">
          <div className="text-sm text-danger">{error}</div>
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="stack stack-lg">
        <PageHeader title="Draft" subtitle="Not found" />
        <EmptyState title="Draft not available" description="Unable to load draft lobby." />
      </div>
    );
  }

  const badge = statusBadge(lobby.status);
  const showTurnGlow = lobby.status === "InProgress" && !!youParticipant;
  const turnGlowClass = showTurnGlow ? (isYourTurn ? "draft-turn-glow draft-turn-glow--green" : "draft-turn-glow draft-turn-glow--red") : "";
  const boardPicks = (state?.picks ?? []).filter((p) => (boardMode === "mine" ? p.teamId === my?.teamId : true));

  return (
    <div className={`stack stack-lg ${turnGlowClass}`}>
      <PageHeader
        title={`Draft — ${seasonName ?? `Season #${seasonId}`}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {leagueId ? (
              <Link className="link" href={`/leagues/${leagueId}`}>
                {leagueName ?? "League"}
              </Link>
            ) : (
              <span className="text-muted">No league</span>
            )}
            <span className={badge.className}>{badge.label}</span>
            {state?.teamOnTheClock ? (
              <span className="badge badge-outline">
                On the clock: {state.teamOnTheClock.teamName}
              </span>
            ) : null}
            {state?.timer?.pickTimerSeconds ? (
              <span className="badge badge-soft">Timer: {state.timer.pickTimerSeconds}s</span>
            ) : null}
            {onlineUserIds.length ? (
              <span className="badge badge-soft">Online: {onlineUserIds.length}</span>
            ) : null}
          </span>
        }
      />

      {/* Picks board (top) */}
      <div className="card p-4 mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Draft board</div>
            <div className="text-xs text-muted">
              {state ? `Pick ${state.overallPickNumber} • Round ${state.currentRound}` : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="join">
              <button
                className={`btn btn-sm join-item ${boardMode === "all" ? "btn" : "btn-outline"}`}
                type="button"
                onClick={() => setBoardMode("all")}
              >
                All picks
              </button>
              <button
                className={`btn btn-sm join-item ${boardMode === "mine" ? "btn" : "btn-outline"}`}
                type="button"
                onClick={() => setBoardMode("mine")}
                disabled={!my?.teamId}
                title={!my?.teamId ? "Join a team to use this" : ""}
              >
                My picks
              </button>
            </div>

            {youParticipant ? (
              <button className="btn btn-sm" onClick={toggleReady} type="button">
                {youParticipant.isReady ? "Unready" : "Ready"}
              </button>
            ) : null}

            <div className="join">
              <button
                className={`btn btn-sm join-item ${boardStyle === "grid" ? "btn" : "btn-outline"}`}
                type="button"
                onClick={() => setBoardStyle("grid")}
              >
                Grid
              </button>
              <button
                className={`btn btn-sm join-item ${boardStyle === "table" ? "btn" : "btn-outline"}`}
                type="button"
                onClick={() => setBoardStyle("table")}
              >
                Table
              </button>
            </div>

            {isYourTurn && lobby.status === "InProgress" ? <span className="badge badge-success">Your pick</span> : null}
          </div>
        </div>

        <div ref={boardScrollRef} className="mt-4 max-h-[320px] overflow-auto rounded-md border border-subtle">
          {boardStyle === "table" ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className="text-left p-2 w-16">#</th>
                  <th className="text-left p-2">Team</th>
                  <th className="text-left p-2">Pokémon</th>
                </tr>
              </thead>
              <tbody>
                {boardPicks.map((p) => (
                  <tr key={p.id} className="border-t border-subtle">
                    <td className="p-2 font-mono">{p.overallPickNumber}</td>
                    <td className="p-2 truncate">{teamNameById.get(p.teamId) ?? p.teamName ?? `Team #${p.teamId}`}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {p.spriteUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.spriteUrl}
                              alt={p.pokemonName ?? String(p.pokemonId)}
                              className="w-8 h-8 object-contain"
                            />
                          ) : (
                            <span className="text-xs text-muted">?</span>
                          )}
                        </div>
                        <span className="truncate">{p.pokemonName ?? `Pokémon #${p.pokemonId}`}</span>
                      </div>
                    </td>
                  </tr>
                ))}

                {boardPicks.length === 0 ? (
                  <tr>
                    <td className="p-3 text-xs text-muted" colSpan={3}>
                      No picks yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <div className="p-3">
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))]">
                {boardPicks.map((p) => {
                  const meta = poolById.get(p.pokemonId);
                  return (
                    <div key={p.id} className="rounded-md border border-subtle p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {p.spriteUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.spriteUrl}
                              alt={p.pokemonName ?? String(p.pokemonId)}
                              className="w-9 h-9 object-contain"
                            />
                          ) : (
                            <span className="text-xs text-muted">?</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted font-mono">#{p.overallPickNumber}</div>
                          <div className="draft-classic-name truncate">{p.pokemonName ?? `Pokémon #${p.pokemonId}`}</div>
                          <div className="text-xs text-muted truncate">
                            {teamNameById.get(p.teamId) ?? p.teamName ?? `Team #${p.teamId}`}
                          </div>
                        </div>
                      </div>
                      {meta?.types?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {meta.types.slice(0, 2).map((t) => (
                            <TypePill key={t} t={t} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {boardPicks.length === 0 ? (
                  <div className="text-xs text-muted">No picks yet.</div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left: Order + commissioner */}
        <div className="md:col-span-3 space-y-4">
          <div className="card p-4">
            <div className="text-sm font-semibold mb-2">Draft order</div>
            <div className="space-y-1">
              {lobby.participants.map((p) => {
                const onClock = state?.teamOnTheClock?.teamId === p.teamId && lobby.status === "InProgress";
                const cls = onClock
                  ? "border-l-4 border-success bg-success/5"
                  : p.isYou
                    ? "border-l-4 border-brand bg-brand/5"
                    : "border-l-4 border-transparent";
                return (
                  <div key={p.teamId} className={`flex items-center justify-between rounded-lg px-3 py-2 ${cls}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.position}. {p.teamName}</div>
                      <div className="text-xs text-muted truncate">
                        {p.managerDisplayName ?? `User #${p.managerUserId}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.isReady ? <span className="badge badge-success">Ready</span> : <span className="badge badge-soft">Not ready</span>}
                    </div>
                  </div>
                );
              })}
            </div>
	          </div>

	          <div className="card p-4">
	            <div className="flex items-center justify-between">
	              <div className="text-sm font-semibold">Coaches</div>
	              <span className="badge badge-soft">{lobby.participants.length}</span>
	            </div>
	            <div className="mt-3 space-y-1">
	              {lobby.participants.map((p) => {
	                const online = onlineUserIds.includes(p.managerUserId);
	                return (
	                  <div
	                    key={p.teamId}
	                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
	                      p.isYou ? "border border-brand/30 bg-brand/5" : "border border-subtle"
	                    }`}
	                  >
	                    <div className="min-w-0">
	                      <div className="flex items-center gap-2 min-w-0">
	                        <span
	                          className={`draft-online-dot ${online ? "draft-online-dot--on" : ""}`}
	                          aria-label={online ? "Online" : "Offline"}
	                          title={online ? "Online" : "Offline"}
	                        />
	                        <div className="text-sm font-medium truncate">{p.teamName}</div>
	                      </div>
	                      <div className="text-xs text-muted truncate">{p.managerDisplayName ?? `User #${p.managerUserId}`}</div>
	                    </div>
	                    <div className="flex items-center gap-2">
	                      {p.isReady ? <span className="badge badge-success">Ready</span> : <span className="badge badge-soft">Not ready</span>}
	                    </div>
	                  </div>
	                );
	              })}
	            </div>
	          </div>

          {canManage ? (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Commissioner</div>
                {settingsLocked ? <span className="badge badge-soft">Settings locked</span> : null}
              </div>

              {/* Settings only before draft starts */}
              {canEditSettings ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted">Type</label>
                    <select
                      className="input input-sm"
                      value={settings.type}
                      onChange={(e) => setSettings((s) => ({ ...s, type: e.target.value as DraftType }))}
                    >
                      <option value="Snake">Snake</option>
                      <option value="Linear">Linear</option>
                      <option value="Custom">Custom</option>
                    </select>

                    <label className="text-xs text-muted">Timer (sec)</label>
                    <input
                      className="input input-sm"
                      inputMode="numeric"
                      value={settings.pickTimerSeconds ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, pickTimerSeconds: e.target.value === "" ? null : Number(e.target.value) }))}
                    />

                    <label className="text-xs text-muted">Rounds</label>
                    <input
                      className="input input-sm"
                      inputMode="numeric"
                      value={settings.roundCount ?? ""}
                      onChange={(e) => setSettings((s) => ({ ...s, roundCount: e.target.value === "" ? null : Number(e.target.value) }))}
                    />

                    <label className="text-xs text-muted">Point cap (0=∞)</label>
                    <input
                      className="input input-sm"
                      inputMode="numeric"
                      value={settings.draftPointCap}
                      onChange={(e) => setSettings((s) => ({ ...s, draftPointCap: Math.max(0, Number(e.target.value) || 0) }))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-sm"
                      onClick={adminUpdateSettings}
                      disabled={settingsBusy}
                    >
                      Save settings
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={adminReroll} disabled={rerollBusy}>
                      Reroll order
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={adminStart} disabled={!canStartDraft || adminBusy === "start"}>
                  Start
                </button>
                <button
                  className="btn btn-sm"
                  onClick={lobby.status === "Paused" ? adminResume : adminPause}
                  disabled={adminBusy === "pause" || adminBusy === "resume" || (lobby.status !== "InProgress" && lobby.status !== "Paused")}
                >
                  {lobby.status === "Paused" ? "Resume" : "Pause"}
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => setForcePickOpen(true)}>
                  Force pick
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => setConfirmUndoOpen(true)} disabled={(state?.picks?.length ?? 0) === 0}>
                  Undo last
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => setConfirmEndOpen(true)} disabled={adminBusy === "end"}>
                  End
                </button>
              </div>

              {!canStartDraft && canEditSettings ? (
                <div className="mt-2 text-xs text-muted">
                  To start: set rounds + timer, and all teams must be ready.
                </div>
              ) : null}
            </div>
          ) : null}

          {!youParticipant ? (
            <div className="card p-4">
              <div className="text-sm font-semibold">Join this season</div>
              <div className="text-xs text-muted mt-1">Create a team to participate in the draft.</div>
              <div className="mt-3 flex gap-2">
                <input
                  className="input input-sm flex-1"
                  placeholder="Team name"
                  value={joinTeamName}
                  onChange={(e) => setJoinTeamName(e.target.value)}
                />
                <button className="btn btn-sm" onClick={joinTeam} disabled={joinBusy || !joinTeamName.trim()}>
                  Create
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Middle: Pool */}
        <div className="md:col-span-6 space-y-4">
          <div className="card p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-semibold">Pokémon pool</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn btn-sm btn-outline" type="button" onClick={loadPool}>
                    Refresh list
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                  >
                    Filters
                    {activeFilterCount ? <span className="ml-2 badge badge-soft">{activeFilterCount}</span> : null}
                  </button>
                  <div className="join">
                    <button
                      className={`btn btn-sm join-item ${viewMode === "flip" ? "btn" : "btn-outline"}`}
                      type="button"
                      onClick={() => setViewMode("flip")}
                    >
                      Flip
                    </button>
                    <button
                      className={`btn btn-sm join-item ${viewMode === "classic" ? "btn" : "btn-outline"}`}
                      type="button"
                      onClick={() => setViewMode("classic")}
                    >
                      Classic
                    </button>
                    </div>
                  </div>
                </div>

                {filtersOpen ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted">Search</label>
                      <input
                        className="input input-sm w-full"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="e.g. Dragapult"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Type</label>
                      <input
                        className="input input-sm w-full"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        placeholder="e.g. Water"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted">Ability / Move</label>
                      <input
                        className="input input-sm w-full"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        placeholder="e.g. Stealth Rock"
                      />
                    </div>
                  </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label className="text-xs text-muted">Min / Max cost</label>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <input
                          className="input input-sm w-full"
                          inputMode="numeric"
                          value={minPoints}
                          onChange={(e) => setMinPoints(e.target.value)}
                          placeholder="Min"
                        />
                        <input
                          className="input input-sm w-full"
                          inputMode="numeric"
                          value={maxPoints}
                          onChange={(e) => setMaxPoints(e.target.value)}
                          placeholder="Max"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted">Sort</label>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <select className="input input-sm" value={sortKey} onChange={(e) => setSortKey(e.target.value as any)}>
                          <option value="dex">Dex</option>
                          <option value="name">Name</option>
                          <option value="pts">Points</option>
                          <option value="hp">HP</option>
                          <option value="atk">ATK</option>
                          <option value="def">DEF</option>
                          <option value="spa">SpA</option>
                          <option value="spd">SpD</option>
                          <option value="spe">SPE</option>
                        </select>
                        <select className="input input-sm" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
                          <option value="asc">Asc</option>
                          <option value="desc">Desc</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <button className="btn btn-sm flex-1 md:flex-none" type="button" onClick={loadPool}>
                        Search
                      </button>
                      <label className="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={hideDrafted}
                          onChange={(e) => setHideDrafted(e.target.checked)}
                        />
                        Hide drafted
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <div className="join">
                  <button className={`btn btn-sm join-item ${showMode === "available" ? "btn" : "btn-outline"}`} onClick={() => setShowMode("available")}>Available</button>
                  <button className={`btn btn-sm join-item ${showMode === "drafted" ? "btn" : "btn-outline"}`} onClick={() => setShowMode("drafted")}>Drafted</button>
                  <button className={`btn btn-sm join-item ${showMode === "mine" ? "btn" : "btn-outline"}`} onClick={() => setShowMode("mine")}>Mine</button>
                  <button className={`btn btn-sm join-item ${showMode === "watchlist" ? "btn" : "btn-outline"}`} onClick={() => setShowMode("watchlist")}>Watchlist</button>
                </div>
              </div>
            </div>
          </div>

          
          <div className="draft-pool-layout">
            <div
              className={`draft-pool-grid ${viewMode === "flip" ? "draft-pool-grid--flip" : "draft-pool-grid--classic"}`}
            >
            {items.length === 0 ? (
              <div className="col-span-full">
                <EmptyState title="No Pokémon" description="Try adjusting your filters." />
              </div>
            ) : null}

            {items.map((p) => {
              const picked = p.isPicked;
              const pickedByYou = picked && p.pickedByTeamId != null && p.pickedByTeamId === my?.teamId;
              const watch = watchlistSet.has(p.pokemonId);
              const canPickNow = lobby.status === "InProgress" && isYourTurn && !picked;

              return viewMode === "classic" ? (
                <div
                  key={p.pokemonId}
                  className={`card draft-classic-card ${picked ? "opacity-70" : ""} ${pickedByYou ? "draft-classic-card--mine" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="draft-classic-sprite">
                      {p.spriteUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.spriteUrl} alt={p.name} className="draft-classic-sprite-img" />
                      ) : (
                        <span className="text-xs text-muted">?</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="draft-classic-name truncate">
                            {p.name} {p.dexNumber ? <span className="text-xs text-muted">#{p.dexNumber}</span> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(p.types ?? []).map((t) => (
                              <TypePill key={t} t={t} />
                            ))}
                            {(p.roles ?? []).slice(0, 2).map((r) => (
                              <span key={r} className="badge badge-soft text-xs">
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          className={`btn btn-sm btn-ghost ${watch ? "text-warning" : "text-muted"}`}
                          onClick={() => onToggleWatch(p.pokemonId)}
                          title={watch ? "Remove from watchlist" : "Add to watchlist"}
                          type="button"
                        >
                          {watch ? "★" : "☆"}
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <StatLine label="HP" v={p.baseStats?.hp} />
                        <StatLine label="ATK" v={p.baseStats?.atk} />
                        <StatLine label="DEF" v={p.baseStats?.def} />
                        <StatLine label="SpA" v={p.baseStats?.spa} />
                        <StatLine label="SpD" v={p.baseStats?.spd} />
                        <StatLine label="SPE" v={p.baseStats?.spe} />
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs text-muted">
                          Cost: <span className="text-foreground font-mono">{p.baseCost ?? "—"}</span>
                          {picked ? (
                            <span className="ml-2 badge badge-soft">
                              Drafted by{" "}
                              {p.pickedByTeamId ? teamNameById.get(p.pickedByTeamId) ?? `Team #${p.pickedByTeamId}` : "?"}
                            </span>
                          ) : null}
                        </div>
                        <button
                          className="btn btn-sm"
                          onClick={() => makePick(p.pokemonId)}
                          disabled={!canPickNow}
                          type="button"
                          title={
                            !canPickNow
                              ? picked
                                ? "Already drafted"
                                : lobby.status !== "InProgress"
                                  ? "Draft not in progress"
                                  : !isYourTurn
                                    ? "Not your turn"
                                    : ""
                              : "Make pick"
                          }
                        >
                          Pick
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              
) : (
  <div
    key={p.pokemonId}
    className={`card border ${picked ? "opacity-70" : ""} ${pickedByYou ? "border-brand" : "border-subtle"} draft-pool-card`}
  >
    <div
      role="button"
      className="draft-flip"
      onClick={() => openDetails(p)}
	  onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails(p);
        }
      }}
      tabIndex={0}
      title={isMobile ? "Open details" : "Flip card"}
      aria-pressed={flipped.has(p.pokemonId)}
    >
      <div className={`draft-flip-inner ${flipped.has(p.pokemonId) ? "is-flipped" : ""}`}>
        <div className="draft-flip-face draft-flip-front">
          <div className="draft-sprite">
            {p.spriteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.spriteUrl} alt={p.name} className="draft-sprite-img" />
            ) : (
              <span className="draft-sprite-missing">?</span>
            )}

            <div className="draft-sprite-overlay">
              <div className="draft-type-row">
                {(p.types ?? []).slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="draft-type-chip"
                    style={
                      (() => {
                        const nt = normalizeType(t);
                        const bg = nt ? TYPE_COLORS[nt] : undefined;
                        return bg ? { backgroundColor: bg, borderColor: bg } : undefined;
                      })()
                    }
                  >
                    {normalizeType(t) ?? t}
                  </span>
                ))}
              </div>

            <div className="draft-watch-btn-wrapper">
                <button
                  className={`draft-watch-btn ${watch ? "is-active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatch(p.pokemonId);
                  }}
                  title={watch ? "Remove from watchlist" : "Add to watchlist"}
                  type="button"
                >
                  {watch ? "★" : "☆"}
                </button>
              </div>
            </div>

            {picked ? <div className="draft-sprite-badge">Drafted</div> : null}
          </div>

          <div className="draft-card-body">
            <div className="draft-card-title">
              <span className="draft-name">{p.name}</span>
              {p.dexNumber ? <span className="draft-dex">#{p.dexNumber}</span> : null}
            </div>

            <div className="draft-card-meta">
              <span className="draft-cost-label">Pts</span>
              <span className="draft-cost-value">{p.baseCost ?? "—"}</span>
              <span className="draft-card-hint">Click to flip</span>
            </div>
          </div>
        </div>

        <div className="draft-flip-face draft-flip-back">
          <div className="draft-card-back-body">
            <div className="draft-card-title">
              <span className="draft-name">{p.name}</span>
              {p.dexNumber ? <span className="draft-dex">#{p.dexNumber}</span> : null}
            </div>

            <div className="draft-stats">
              <StatLine label="HP" v={p.baseStats?.hp} />
              <StatLine label="ATK" v={p.baseStats?.atk} />
              <StatLine label="DEF" v={p.baseStats?.def} />
              <StatLine label="SpA" v={p.baseStats?.spa} />
              <StatLine label="SpD" v={p.baseStats?.spd} />
              <StatLine label="SPE" v={p.baseStats?.spe} />
            </div>

            <div className="draft-abilities">
              <span className="draft-abilities-label">Abilities</span>
              <div className="draft-abilities-list">
                {(p.roles ?? []).length ? (
                  (p.roles ?? []).slice(0, 3).map((r) => (
                    <span key={r} className="draft-ability-chip">
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="draft-ability-chip is-empty">—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="draft-card-actions">
      <div className="draft-cost-block">
        <span className="draft-cost-label">Pts</span>
        <span className="draft-cost-value">{p.baseCost ?? "—"}</span>
      </div>

      <button
        className="btn btn-sm draft-action-btn"
        onClick={(e) => {
          e.stopPropagation();
          makePick(p.pokemonId);
        }}
        disabled={!canPickNow}
        type="button"
        title={
          !canPickNow
            ? picked
              ? "Already drafted"
              : lobby.status !== "InProgress"
                ? "Draft not in progress"
                : !isYourTurn
                  ? "Not your turn"
                  : ""
            : "Make pick"
        }
      >
        {picked ? "Drafted" : "Draft"}
      </button>
    </div>
  </div>
);
            })}
            </div>

            <aside className="draft-pool-aside">
<div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Watchlist</div>
              <span className="badge badge-soft">{watchlistSet.size}</span>
            </div>
            <div className="mt-3 space-y-2">
              {(pool?.items ?? [])
                .filter((p) => watchlistSet.has(p.pokemonId) && !draftedIds.has(p.pokemonId))
                .slice(0, 12)
                .map((p) => (
                  <button
                    key={p.pokemonId}
                    className="w-full flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 hover:bg-muted text-left"
                    onClick={() => onToggleWatch(p.pokemonId)}
                    title="Toggle watch"
                  >
                    <span className="text-warning">★</span>
                    <span className="text-sm font-medium truncate flex-1">{p.name}</span>
                    <span className="text-xs text-muted font-mono">{p.baseCost ?? "—"}</span>
                  </button>
                ))}
              {watchlistSet.size === 0 ? (
                <div className="text-xs text-muted">Star Pokémon to add them here.</div>
              ) : null}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Team analyser</div>
              <div className="join">
                <button
                  className={`btn btn-xs join-item ${analyserMode === "coverage" ? "btn" : "btn-outline"}`}
                  onClick={() => setAnalyserMode("coverage")}
                >
                  Coverage
                </button>
                <button
                  className={`btn btn-xs join-item ${analyserMode === "defense" ? "btn" : "btn-outline"}`}
                  onClick={() => setAnalyserMode("defense")}
                >
                  Defense
                </button>
              </div>
            </div>

            {analyserMode === "coverage" ? (

<div className="mt-3 space-y-3">
  <div>
    <div className="text-xs text-muted mb-2">Types you have (drafted by you).</div>
    <div className="flex flex-wrap gap-1">
      {TYPES.filter((t) => rosterTypeSet.has(t)).length ? (
        TYPES.filter((t) => rosterTypeSet.has(t)).map((t) => <TypePill key={t} t={t} />)
      ) : (
        <span className="text-xs text-muted">None yet.</span>
      )}
    </div>
  </div>

  <div>
    <div className="text-xs text-muted mb-2">Types you&apos;re missing.</div>
    <div className="flex flex-wrap gap-1">
      {TYPES.filter((t) => !rosterTypeSet.has(t)).map((t) => (
        <TypePill key={t} t={t} dimmed />
      ))}
    </div>
  </div>
</div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs text-muted">Immune (at least one)</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {defSummary.immune.length ? defSummary.immune.map((t) => <span key={t} className="badge badge-success">{t}</span>) : <span className="text-xs text-muted">None</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Resists (team worst-case &lt; 1×)</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {defSummary.resist.length ? defSummary.resist.map((t) => <span key={t} className="badge badge-outline">{t}</span>) : <span className="text-xs text-muted">None</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Weak (team worst-case &gt; 1×)</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {defSummary.weak.length ? defSummary.weak.map((t) => <span key={t} className="badge badge-warn">{t}</span>) : <span className="text-xs text-muted">None</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Mobile: flip details sheet */}

      {sheetFor ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setSheetFor(null)}
            aria-label="Close"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-2md bg-surface border-t border-subtle shadow-md">
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {sheetFor.spriteUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sheetFor.spriteUrl} alt={sheetFor.name} className="w-16 h-16 object-contain" />
                    ) : (
                      <span className="text-xs text-muted">?</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold truncate">
                      {sheetFor.name}{" "}
                      {sheetFor.dexNumber ? <span className="text-xs text-muted">#{sheetFor.dexNumber}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(sheetFor.types ?? []).map((t) => (
                        <TypePill key={t} t={t} />
                      ))}
                      {(sheetFor.roles ?? []).slice(0, 3).map((r) => (
                        <span key={r} className="badge badge-soft text-xs">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button className="btn btn-sm btn-outline" type="button" onClick={() => setSheetFor(null)}>
                  Close
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="join">
                  <button
                    type="button"
                    className={`btn btn-sm join-item ${sheetSide === "front" ? "btn" : "btn-outline"}`}
                    onClick={() => setSheetSide("front")}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm join-item ${sheetSide === "back" ? "btn" : "btn-outline"}`}
                    onClick={() => setSheetSide("back")}
                  >
                    Back
                  </button>
                </div>
                <div className="text-sm">
                  Cost: <span className="font-mono">{sheetFor.baseCost ?? "—"}</span>
                </div>
              </div>

              {sheetSide === "front" ? (
                <div className="mt-4 text-xs text-muted">
                  Tap “Back” for stats.
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1">
                  <StatLine label="HP" v={sheetFor.baseStats?.hp} />
                  <StatLine label="ATK" v={sheetFor.baseStats?.atk} />
                  <StatLine label="DEF" v={sheetFor.baseStats?.def} />
                  <StatLine label="SpA" v={sheetFor.baseStats?.spa} />
                  <StatLine label="SpD" v={sheetFor.baseStats?.spd} />
                  <StatLine label="SPE" v={sheetFor.baseStats?.spe} />
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <button
                  className={`btn btn-sm btn-ghost ${watchlistSet.has(sheetFor.pokemonId) ? "text-warning" : "text-muted"}`}
                  type="button"
                  onClick={() => onToggleWatch(sheetFor.pokemonId)}
                >
                  {watchlistSet.has(sheetFor.pokemonId) ? "★ Watched" : "☆ Watch"}
                </button>

                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => makePick(sheetFor.pokemonId)}
                  disabled={!(lobby.status === "InProgress" && isYourTurn && !sheetFor.isPicked)}
                >
                  Pick
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmEndOpen}
        title="End draft"
        description="This will mark the draft as completed."
        confirmLabel="End draft"
        confirmKind="danger"
        onCancel={() => setConfirmEndOpen(false)}
        onConfirm={async () => {
          setConfirmEndOpen(false);
          await adminEnd();
        }}
      />

      <ConfirmDialog
        open={confirmUndoOpen}
        title="Undo last pick"
        description="This will remove the most recent pick and revert roster ownership."
        confirmLabel="Undo"
        confirmKind="primary"
        onCancel={() => setConfirmUndoOpen(false)}
        onConfirm={async () => {
          setConfirmUndoOpen(false);
          await adminUndo();
        }}
      />

      <ConfirmDialog
        open={forcePickOpen}
        title="Force pick"
        description="Pick a Pokémon (and optionally a team) as commissioner."
        confirmLabel="Force"
        confirmKind="primary"
        onCancel={() => setForcePickOpen(false)}
        onConfirm={adminForce}
        isBusy={adminBusy === "force"}
      >
        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs text-muted">Team (optional)</label>
          <select
            className="input input-sm"
            value={forcePickTeamId}
            onChange={(e) => setForcePickTeamId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">(Current team on clock)</option>
            {lobby.participants.map((p) => (
              <option key={p.teamId} value={p.teamId}>
                {p.teamName}
              </option>
            ))}
          </select>

          <label className="text-xs text-muted">Pokémon id</label>
          <input
            className="input input-sm"
            inputMode="numeric"
            value={forcePickPokemonId}
            onChange={(e) => setForcePickPokemonId(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
      </ConfirmDialog>

    </div>
  );
}
