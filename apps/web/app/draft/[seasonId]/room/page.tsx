"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiFetchJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import {
  adminAdvanceSvc,
  adminEndSvc,
  adminForcePickSvc,
  adminPauseSvc,
  adminResumeSvc,
  adminStartSvc,
  adminUndoLastSvc,
  fetchLobby,
  fetchMy,
  fetchPool,
  fetchState,
  makePickSvc,
  toggleReadySvc,
  updateWatchlistSvc,
  type DraftLobbyResponse,
  type DraftPoolItem,
  type DraftPoolResponse,
  type DraftStateResponse,
  type MyDraftResponse,
} from "@/kit/drafts";
import { useDraftClock, useIsMobile } from "@/kit/hooks";
import { Card, Filters, TypeBadge, Stat } from "@/kit/ui";
import { defenseSummary } from "@/kit/combat";

type SeasonOverviewResponse = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    description: string | null;
    status: string;
  };
  yourTeam?: { teamId: number; name: string; logoUrl: string | null };
};

type SeasonSettingsResponse = {
  seasonId: number;
  settings: {
    draftPointCap: number;
    pickTimerSeconds: number;
    roundCount: number;
    draftType: "Snake" | "Linear";
    allowTrades: boolean;
    tradeDeadlineAt: string | null;
  };
};

type LeagueDetailResponse = {
  id: number;
  name: string;
  myRole: "owner" | "commissioner" | "member" | null;
};

function fmtClock(s: number) {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function DraftRoomPage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = Number(params?.seasonId);
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();

  const [overview, setOverview] = React.useState<SeasonOverviewResponse | null>(null);
  const [league, setLeague] = React.useState<LeagueDetailResponse | null>(null);
  const [settings, setSettings] = React.useState<SeasonSettingsResponse | null>(null);

  const [lobby, setLobby] = React.useState<DraftLobbyResponse | null>(null);
  const [state, setState] = React.useState<DraftStateResponse | null>(null);
  const [pool, setPool] = React.useState<DraftPoolResponse | null>(null);
  const [mine, setMine] = React.useState<MyDraftResponse | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [filters, setFilters] = React.useState({
    q: "",
    type: "",
    ability: "",
    move: "",
    minPoints: "",
    maxPoints: "",
    sortKey: "id",
    sortDir: "asc",
    hideDrafted: true,
  });

  const [watch, setWatch] = React.useState<Set<number>>(() => new Set());
  React.useEffect(() => {
    setWatch(new Set(mine?.watchlistPokemonIds ?? []));
  }, [mine?.watchlistPokemonIds]);

  const isCommissioner = league?.myRole === "owner" || league?.myRole === "commissioner";
  const isYourTurn = !!(state?.teamOnTheClock && mine && state.teamOnTheClock.teamId === mine.teamId);
  const remaining = useDraftClock(lobby?.status ?? "NotStarted", state);

  const loadAll = React.useCallback(async (opts?: { pool?: boolean }) => {
    if (!Number.isFinite(seasonId) || seasonId <= 0) return;
    if (!user) return;

    const [ov, stg] = await Promise.all([
      apiFetchJson<SeasonOverviewResponse>(`/seasons/${seasonId}`),
      apiFetchJson<SeasonSettingsResponse>(`/seasons/${seasonId}/settings`),
    ]);

    setOverview(ov);
    setSettings(stg);

    if (ov.season.leagueId) {
      try {
        const lg = await apiFetchJson<LeagueDetailResponse>(`/leagues/${ov.season.leagueId}`);
        setLeague(lg);
      } catch {
        setLeague(null);
      }
    } else {
      setLeague(null);
    }

    const [lb, ds, my] = await Promise.all([fetchLobby(seasonId), fetchState(seasonId), fetchMy(seasonId)]);
    setLobby(lb);
    setState(ds);
    setMine(my);

    if (opts?.pool) {
      const p = await fetchPool(seasonId, {
        search: filters.q,
        type: filters.type,
        ability: filters.ability,
        move: filters.move,
        onlyAvailable: filters.hideDrafted,
        page: 1,
        limit: 48,
      });
      setPool(p);
    }
  }, [filters.ability, filters.hideDrafted, filters.move, filters.q, filters.type, seasonId, user]);

  // Initial load + poll
  React.useEffect(() => {
    if (isLoading) return;
    if (!user) return;

    let alive = true;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        await loadAll({ pool: true });
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load draft");
      } finally {
        if (alive) setBusy(false);
      }
    })();

    const t = setInterval(() => {
      if (!alive) return;
      // keep lobby/state/my fresh; pool is manual refresh
      Promise.allSettled([fetchLobby(seasonId), fetchState(seasonId), fetchMy(seasonId)]).then((r) => {
        if (!alive) return;
        const lb = r[0].status === "fulfilled" ? r[0].value : null;
        const st = r[1].status === "fulfilled" ? r[1].value : null;
        const my = r[2].status === "fulfilled" ? r[2].value : null;
        if (lb) setLobby(lb);
        if (st) setState(st);
        if (my) setMine(my);
      });
    }, 2000);

    return () => {
      alive = false;
      clearInterval(t);
    };
}, [loadAll, isLoading, seasonId, user]);

  const cap = settings?.settings.draftPointCap ?? 0;
  const spent = React.useMemo(() => {
    const roster = mine?.roster ?? [];
    let sum = 0;
    for (const p of roster) sum += p.baseCost ?? 0;
    return sum;
  }, [mine?.roster]);

  const rosterTypes = React.useMemo(() => (mine?.roster ?? []).map((p) => p.types ?? []), [mine?.roster]);
  const def = React.useMemo(() => defenseSummary(rosterTypes), [rosterTypes]);

  async function refreshPool() {
    if (!user) return;
    try {
      const p = await fetchPool(seasonId, {
        search: filters.q,
        type: filters.type,
        ability: filters.ability,
        move: filters.move,
        onlyAvailable: filters.hideDrafted,
        page: 1,
        limit: 48,
      });
      setPool(p);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load pool");
    }
  }

  async function toggleReady() {
    try {
      await toggleReadySvc(seasonId);
      const lb = await fetchLobby(seasonId);
      setLobby(lb);
    } catch (e: any) {
      setError(e?.message ?? "Failed to toggle ready");
    }
  }

  async function toggleWatch(id: number) {
    const next = new Set(watch);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setWatch(next);
    try {
      await updateWatchlistSvc(seasonId, Array.from(next));
    } catch (e: any) {
      setError(e?.message ?? "Failed to update watchlist");
    }
  }

  async function makePick(pokemonId: number) {
    try {
      await makePickSvc(seasonId, pokemonId);
      const [st, my, p] = await Promise.all([fetchState(seasonId), fetchMy(seasonId), refreshPool()]);
      void p;
      setState(st);
      setMine(my);
    } catch (e: any) {
      setError(e?.message ?? "Pick failed");
    }
  }

  async function admin(action: "start" | "pause" | "resume" | "end" | "undo" | "advance") {
    try {
      if (action === "start") await adminStartSvc(seasonId);
      if (action === "pause") await adminPauseSvc(seasonId);
      if (action === "resume") await adminResumeSvc(seasonId);
      if (action === "end") await adminEndSvc(seasonId);
      if (action === "undo") await adminUndoLastSvc(seasonId);
      if (action === "advance") await adminAdvanceSvc(seasonId);
      const [lb, st] = await Promise.all([fetchLobby(seasonId), fetchState(seasonId)]);
      setLobby(lb);
      setState(st);
      await refreshPool();
    } catch (e: any) {
      setError(e?.message ?? "Admin action failed");
    }
  }

  const [forcePickId, setForcePickId] = React.useState<string>("");
  const [forceTeamId, setForceTeamId] = React.useState<string>("");
  async function forcePick() {
    const pokemonId = Number(forcePickId);
    const teamId = forceTeamId ? Number(forceTeamId) : undefined;
    if (!Number.isFinite(pokemonId) || pokemonId <= 0) {
      setError("Enter a valid Pokémon id.");
      return;
    }
    try {
      await adminForcePickSvc(seasonId, { pokemonId, ...(teamId ? { teamId } : {}) });
      setForcePickId("");
      setForceTeamId("");
      const [lb, st] = await Promise.all([fetchLobby(seasonId), fetchState(seasonId)]);
      setLobby(lb);
      setState(st);
      await refreshPool();
    } catch (e: any) {
      setError(e?.message ?? "Force pick failed");
    }
  }

  if (!Number.isFinite(seasonId) || seasonId <= 0) {
    return (
      <main className="max-w-[1100px] mx-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">Invalid season id.</div>
      </main>
    );
  }

  if (!user && !isLoading) {
    return (
      <main className="max-w-[1100px] mx-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm opacity-80">You need to sign in to use the draft room.</p>
          <Link href="/login" className="inline-block mt-3 px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-[1100px] mx-auto p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{overview?.season.name ?? "Draft Room"}</h1>
            {lobby ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border border-white/10 bg-white/5">
                {lobby.status}
              </span>
            ) : null}
          </div>
          <div className="text-sm opacity-80 mt-1 flex items-center gap-2 flex-wrap">
            <Link href="/draft" className="underline underline-offset-4 opacity-80 hover:opacity-100">
              Back to Draft
            </Link>
            <span className="opacity-50">•</span>
            <Link href={`/seasons/${seasonId}`} className="underline underline-offset-4 opacity-80 hover:opacity-100">
              Season hub
            </Link>
            {league?.name ? (
              <>
                <span className="opacity-50">•</span>
                <span className="opacity-80">{league.name}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110 disabled:opacity-60"
            onClick={() => loadAll({ pool: true })}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {busy && !lobby ? <div className="mt-6 text-sm opacity-80">Loading…</div> : null}

      {lobby && state && mine ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="grid gap-4">
            <Card title="On the clock">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm opacity-80">Pick</div>
                  <div className="text-xl font-semibold">
                    {state.teamOnTheClock ? state.teamOnTheClock.teamName : "—"}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    Round {state.currentRound} • Pick {state.currentPickInRound} • Overall {state.overallPickNumber}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm opacity-80">Timer</div>
                  <div className="text-2xl font-mono font-semibold">
                    {state.timer.pickTimerSeconds ? fmtClock(remaining) : "—"}
                  </div>
                  <div className="text-xs opacity-70 mt-1">{isYourTurn ? "Your turn" : ""}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <button
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm"
                  onClick={toggleReady}
                >
                  Toggle ready
                </button>

                {isCommissioner ? (
                  <>
                    <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => admin("start")}>
                      Start
                    </button>
                    <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => admin("pause")}>
                      Pause
                    </button>
                    <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => admin("resume")}>
                      Resume
                    </button>
                    <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => admin("undo")}>
                      Undo
                    </button>
                    <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={() => admin("advance")}>
                      Advance
                    </button>
                    <button className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-100 text-sm border border-red-400/20 rounded-xl" onClick={() => admin("end")}>
                      End
                    </button>
                  </>
                ) : null}
              </div>

              {isCommissioner ? (
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <input
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 outline-none"
                    placeholder="Force pick Pokémon id"
                    value={forcePickId}
                    onChange={(e) => setForcePickId(e.target.value)}
                    inputMode="numeric"
                  />
                  <select
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 outline-none"
                    value={forceTeamId}
                    onChange={(e) => setForceTeamId(e.target.value)}
                  >
                    <option value="">Current team on clock</option>
                    {lobby.participants.map((p) => (
                      <option key={p.teamId} value={String(p.teamId)}>
                        {p.teamName}
                      </option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110"
                    onClick={forcePick}
                  >
                    Force pick
                  </button>
                </div>
              ) : null}
            </Card>

            <Card title="Pool">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs opacity-70">Showing {pool?.items.length ?? 0} of {pool?.total ?? 0}</div>
                <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm" onClick={refreshPool}>
                  Refresh pool
                </button>
              </div>

              <div className="mt-3">
                <Filters
                  filters={filters}
                  onChange={setFilters}
                  onSearch={refreshPool}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(pool?.items ?? []).map((p) => (
                  <PoolCard
                    key={p.pokemonId}
                    p={p}
                    watched={watch.has(p.pokemonId)}
                    onWatch={() => toggleWatch(p.pokemonId)}
                    onPick={() => makePick(p.pokemonId)}
                    canPick={lobby.status === "InProgress" && isYourTurn && !p.isPicked}
                  />
                ))}
              </div>
            </Card>

            <Card title="Draft board">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs opacity-70">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Team</th>
                      <th className="py-2">Pokémon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.picks.map((pk) => (
                      <tr key={pk.id} className="border-t border-white/10">
                        <td className="py-2 pr-2 font-mono opacity-80">{pk.overallPickNumber}</td>
                        <td className="py-2 pr-2 truncate">{pk.teamName ?? `Team ${pk.teamId}`}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            {pk.spriteUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={pk.spriteUrl} alt="" className="h-8 w-8 object-contain" />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-white/5" />
                            )}
                            <span className="truncate">{pk.pokemonName ?? `#${pk.pokemonId}`}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <aside className="grid gap-4">
            <Card title="Your team">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-lg font-semibold">{mine.teamName}</div>
                  <div className="text-xs opacity-70">Team #{mine.teamId}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs opacity-70">Points</div>
                  <div className="font-mono font-semibold">
                    {spent}{cap > 0 ? ` / ${cap}` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {(mine.roster ?? []).map((r) => (
                  <div key={r.pokemonId} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.spriteUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.spriteUrl} alt="" className="h-8 w-8 object-contain" />
                      ) : (
                        <div className="h-8 w-8 rounded-lg bg-white/5" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{r.name}</div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {(r.types ?? []).map((t) => (
                            <TypeBadge key={t} t={t} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono text-xs opacity-80">{r.baseCost ?? "—"}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Team analyser">
              <div className="grid gap-3">
                <div>
                  <div className="text-xs opacity-70">Defense summary</div>
                  <div className="mt-2 grid gap-2">
                    <div>
                      <div className="text-xs opacity-70">Immune</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {def.immune.length ? def.immune.map((t) => <span key={t} className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/20 text-xs">{t}</span>) : <span className="text-xs opacity-70">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs opacity-70">Resists</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {def.resist.length ? def.resist.map((t) => <span key={t} className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-xs">{t}</span>) : <span className="text-xs opacity-70">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs opacity-70">Weak</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {def.weak.length ? def.weak.map((t) => <span key={t} className="px-2 py-1 rounded-lg bg-rose-500/20 border border-rose-400/20 text-xs">{t}</span>) : <span className="text-xs opacity-70">—</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Watchlist">
              <div className="grid gap-2">
                {(pool?.items ?? []).filter((p) => watch.has(p.pokemonId)).slice(0, 10).map((p) => (
                  <button
                    key={p.pokemonId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                    onClick={() => toggleWatch(p.pokemonId)}
                    title="Unwatch"
                  >
                    <span className="truncate">★ {p.name}</span>
                    <span className="font-mono text-xs opacity-70">{p.baseCost ?? "—"}</span>
                  </button>
                ))}

                {watch.size === 0 ? <div className="text-sm opacity-80">Star Pokémon in the pool to track them.</div> : null}
              </div>
            </Card>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function PoolCard({
  p,
  watched,
  onWatch,
  onPick,
  canPick,
}: {
  p: DraftPoolItem;
  watched: boolean;
  onWatch: () => void;
  onPick: () => void;
  canPick: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 min-w-0">
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {p.spriteUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.spriteUrl} alt={p.name} className="h-14 w-14 object-contain" />
          ) : (
            <span className="text-xs opacity-70">?</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold truncate">{p.name}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(p.types ?? []).map((t) => (
                  <TypeBadge key={t} t={t} />
                ))}
              </div>
            </div>

            <button
              className={`px-2 py-1 rounded-lg border text-xs ${watched ? "border-amber-400/40 bg-amber-400/20" : "border-white/10 bg-white/5"}`}
              onClick={onWatch}
              title={watched ? "Unwatch" : "Watch"}
            >
              {watched ? "★" : "☆"}
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="HP" v={p.baseStats?.hp} />
            <Stat label="Atk" v={p.baseStats?.atk} />
            <Stat label="Spe" v={p.baseStats?.spe} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm">
          Cost: <span className="font-mono font-semibold">{p.baseCost ?? "—"}</span>
        </div>
        <button
          className={`px-3 py-2 rounded-xl text-sm ${canPick ? "bg-brand text-black hover:brightness-110" : "bg-white/10 text-white/60"}`}
          onClick={onPick}
          disabled={!canPick}
        >
          {p.isPicked ? "Drafted" : "Pick"}
        </button>
      </div>
    </div>
  );
}
