"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiFetchJson, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";

type LeagueRole = "owner" | "commissioner" | "member" | string;

type SeasonOverviewResponse = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    status: string;
  };
};

type LeagueView = {
  league: { id: number; name: string };
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
  }[];
};

type DraftPoolItem = {
  pokemonId: number;
  name: string;
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
  watchlistPokemonIds: number[];
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

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

export default function DraftHubPage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = Number(params?.seasonId);

  const toast = useToast();

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

  // pool filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  // modals
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmUndoOpen, setConfirmUndoOpen] = useState(false);
  const [forcePickOpen, setForcePickOpen] = useState(false);

  // commissioner action state
  const [adminBusy, setAdminBusy] = useState<null | "start" | "pause" | "end" | "undo" | "force">(null);
  const [forcePickTeamId, setForcePickTeamId] = useState<number | "">("");
  const [forcePickPokemonId, setForcePickPokemonId] = useState<number | "">("");

  const canManage = myRole === "owner" || myRole === "commissioner";

  const youParticipant = useMemo(() => {
    return lobby?.participants.find((p) => p.isYou) ?? null;
  }, [lobby?.participants]);

  const isYourTurn = useMemo(() => {
    if (!state?.teamOnTheClock || !youParticipant) return false;
    return state.teamOnTheClock.teamId === youParticipant.teamId;
  }, [state?.teamOnTheClock, youParticipant]);

  const watchlistSet = useMemo(() => new Set<number>(my?.watchlistPokemonIds ?? []), [my?.watchlistPokemonIds]);

  const watchlistItems = useMemo(() => {
    const items = pool?.items ?? [];
    const wanted = my?.watchlistPokemonIds ?? [];
    const byId = new Map(items.map((i) => [i.pokemonId, i] as const));
    return wanted.map((id) => byId.get(id)).filter((x): x is DraftPoolItem => Boolean(x));
  }, [pool?.items, my?.watchlistPokemonIds]);

  async function loadHeaderContext(seasonIdValue: number) {
    const ov = await apiFetchJson<SeasonOverviewResponse>(`/seasons/${seasonIdValue}`);
    setSeasonName(ov.season.name);
    setLeagueId(ov.season.leagueId ?? null);

    if (ov.season.leagueId) {
      try {
        const lv = await apiFetchJson<LeagueView>(`/leagues/${ov.season.leagueId}`);
        setLeagueName(lv.league?.name ?? null);
        setMyRole(lv.myRole ?? null);
      } catch {
        setLeagueName(null);
        setMyRole(null);
      }
    } else {
      setLeagueName(null);
      setMyRole(null);
    }
  }

  function poolUrl(seasonIdValue: number) {
    return (
      `/seasons/${seasonIdValue}/draft/pool?onlyAvailable=${onlyAvailable ? "true" : "false"}` +
      (search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "") +
      (typeFilter.trim() ? `&type=${encodeURIComponent(typeFilter.trim())}` : "")
    );
  }

  async function loadCoreDraft(seasonIdValue: number) {
    const [lb, st, pl] = await Promise.all([
      apiFetchJson<DraftLobbyResponse>(`/seasons/${seasonIdValue}/draft/lobby`),
      apiFetchJson<DraftStateResponse>(`/seasons/${seasonIdValue}/draft/state`),
      apiFetchJson<DraftPoolResponse>(poolUrl(seasonIdValue))
    ]);
    setLobby(lb);
    setState(st);
    setPool(pl);
  }

  async function tryLoadMy(seasonIdValue: number) {
    try {
      const me = await apiFetchJson<MyDraftResponse>(`/seasons/${seasonIdValue}/draft/my`);
      setMy(me);
    } catch (e) {
      // Break the catch-22: if backend 500s here, we still render the page.
      if (e instanceof ApiError && (e.status === 404 || e.status === 400 || e.status === 401 || e.status === 403 || e.status >= 500)) {
        setMy(null);
        return;
      }
      throw e;
    }
  }

  async function reloadPool(seasonIdValue: number) {
    const pl = await apiFetchJson<DraftPoolResponse>(poolUrl(seasonIdValue));
    setPool(pl);
  }

  async function reloadLobbyState(seasonIdValue: number) {
    const [lb, st] = await Promise.all([
      apiFetchJson<DraftLobbyResponse>(`/seasons/${seasonIdValue}/draft/lobby`),
      apiFetchJson<DraftStateResponse>(`/seasons/${seasonIdValue}/draft/state`)
    ]);
    setLobby(lb);
    setState(st);
  }

  async function refreshAll() {
    if (!seasonId) return;
    setLoading(true);
    setError(null);
    try {
      await loadHeaderContext(seasonId);
      await loadCoreDraft(seasonId);
      await tryLoadMy(seasonId);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load draft";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isInteger(seasonId) || seasonId <= 0) {
      setError("Invalid seasonId");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadHeaderContext(seasonId);
        await loadCoreDraft(seasonId);
        await tryLoadMy(seasonId);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Failed to load draft";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  // Re-query pool when filters change (debounced)
  useEffect(() => {
    if (!seasonId) return;
    const t = setTimeout(async () => {
      try {
        await reloadPool(seasonId);
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, onlyAvailable, search, typeFilter]);

  // -----------------------------
  // Player actions
  // -----------------------------

  async function toggleReady() {
    if (!seasonId) return;
    try {
      await apiFetchJson<DraftLobbyResponse>(`/seasons/${seasonId}/draft/ready`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await Promise.all([reloadLobbyState(seasonId), tryLoadMy(seasonId)]);
      toast.push({ kind: "success", title: "Updated ready state" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to toggle ready";
      toast.push({ kind: "error", title: "Ready update failed", message: msg });
    }
  }

  async function makePick(pokemonId: number) {
    if (!seasonId) return;
    try {
      await apiFetchJson<DraftStateResponse>(`/seasons/${seasonId}/draft/pick`, {
        method: "POST",
        body: JSON.stringify({ pokemonId })
      });
      await Promise.all([reloadLobbyState(seasonId), reloadPool(seasonId), tryLoadMy(seasonId)]);
      toast.push({ kind: "success", title: "Pick submitted" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to pick";
      toast.push({ kind: "error", title: "Pick failed", message: msg });
    }
  }

  async function setWatchlist(nextIds: number[]) {
    if (!seasonId) return;
    if (!my) return; // no team context; don't try
    try {
      const res = await apiFetchJson<{ seasonId: number; teamId: number; pokemonIds: number[] }>(
        `/seasons/${seasonId}/draft/watchlist`,
        { method: "POST", body: JSON.stringify({ pokemonIds: nextIds }) }
      );
      setMy((prev) => (prev ? { ...prev, watchlistPokemonIds: res.pokemonIds } : prev));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to update watchlist";
      toast.push({ kind: "error", title: "Watchlist failed", message: msg });
    }
  }

  function toggleWatch(pokemonId: number) {
    const current = my?.watchlistPokemonIds ?? [];
    const has = current.includes(pokemonId);
    const next = has ? current.filter((id) => id !== pokemonId) : [...current, pokemonId];
    void setWatchlist(next);
  }

  // -----------------------------
  // Commissioner actions
  // -----------------------------

  async function adminCall(path: string, body?: unknown) {
    if (!seasonId) return;
    try {
      const st = await apiFetchJson<DraftStateResponse>(path, {
        method: "POST",
        body: JSON.stringify(body ?? {})
      });
      setState(st);
      await Promise.all([reloadLobbyState(seasonId), reloadPool(seasonId), tryLoadMy(seasonId)]);
      return st;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Admin action failed";
      toast.push({ kind: "error", title: "Commissioner action failed", message: msg });
      throw e;
    }
  }

  async function adminStartOrResume() {
    if (!seasonId) return;
    setAdminBusy("start");
    try {
      await adminCall(`/seasons/${seasonId}/draft/admin/start`);
      toast.push({ kind: "success", title: "Draft in progress" });
    } finally {
      setAdminBusy(null);
    }
  }

  async function adminPause() {
    if (!seasonId) return;
    setAdminBusy("pause");
    try {
      await adminCall(`/seasons/${seasonId}/draft/admin/pause`);
      toast.push({ kind: "success", title: "Draft paused" });
    } finally {
      setAdminBusy(null);
    }
  }

  async function adminEnd() {
    if (!seasonId) return;
    setAdminBusy("end");
    try {
      await adminCall(`/seasons/${seasonId}/draft/admin/end`);
      toast.push({ kind: "success", title: "Draft completed" });
      setConfirmEndOpen(false);
    } finally {
      setAdminBusy(null);
    }
  }

  async function adminUndoLast() {
    if (!seasonId) return;
    setAdminBusy("undo");
    try {
      await adminCall(`/seasons/${seasonId}/draft/admin/undo-last`);
      toast.push({ kind: "success", title: "Last pick undone" });
      setConfirmUndoOpen(false);
    } finally {
      setAdminBusy(null);
    }
  }

  async function adminForcePick() {
    if (!seasonId) return;
    if (!forcePickPokemonId || typeof forcePickPokemonId !== "number") {
      toast.push({ kind: "error", title: "Pick requires Pokémon ID" });
      return;
    }
    const payload: { pokemonId: number; teamId?: number } = { pokemonId: forcePickPokemonId };
    if (forcePickTeamId && typeof forcePickTeamId === "number") payload.teamId = forcePickTeamId;

    setAdminBusy("force");
    try {
      await adminCall(`/seasons/${seasonId}/draft/admin/force-pick`, payload);
      toast.push({ kind: "success", title: "Force pick applied" });
      setForcePickOpen(false);
      setForcePickPokemonId("");
      setForcePickTeamId("");
    } finally {
      setAdminBusy(null);
    }
  }

  // -----------------------------
  // Render helpers
  // -----------------------------

  const badge = statusBadge(state?.status ?? lobby?.status ?? "NotStarted");

  const backToSeasonHref = leagueId ? `/leagues/${leagueId}/seasons/${seasonId}` : `/leagues`;

  const typesForFilter = useMemo(() => {
    const set = new Set<string>();
    for (const i of pool?.items ?? []) for (const t of i.types ?? []) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pool?.items]);

  const hasTeamContext = Boolean(youParticipant) && Boolean(my);

  return (
    <PageShell>
      <PageHeader
        title={seasonName ? `${seasonName} Draft` : "Draft"}
        subtitle={leagueName ? `${leagueName} • ${badge.label}` : badge.label}
        breadcrumb={
          <Link className="link" href={backToSeasonHref}>
            ← Back to Season
          </Link>
        }
        actions={
          <div className="row row-sm">
            <span className={badge.className}>{badge.label}</span>
            <button type="button" className="btn btn-secondary" onClick={refreshAll}>
              Refresh
            </button>
            {youParticipant ? (
              <button type="button" className="btn btn-secondary" onClick={toggleReady}>
                {youParticipant.isReady ? "Set not ready" : "Set ready"}
              </button>
            ) : null}
          </div>
        }
      />

      <ConfirmDialog
        open={confirmEndOpen}
        title="End draft?"
        description="This sets the draft to Completed. Picks will remain viewable."
        confirmLabel="End draft"
        confirmKind="danger"
        isBusy={adminBusy === "end"}
        onCancel={() => setConfirmEndOpen(false)}
        onConfirm={adminEnd}
      />

      <ConfirmDialog
        open={confirmUndoOpen}
        title="Undo last pick?"
        description="This removes the most recent pick from the draft."
        confirmLabel="Undo"
        confirmKind="danger"
        isBusy={adminBusy === "undo"}
        onCancel={() => setConfirmUndoOpen(false)}
        onConfirm={adminUndoLast}
      />

      <ConfirmDialog
        open={forcePickOpen}
        title="Force pick"
        description="Force a pick for the team on the clock. Leave teamId blank to auto-use the current team."
        confirmLabel="Force pick"
        confirmKind="danger"
        isBusy={adminBusy === "force"}
        onCancel={() => setForcePickOpen(false)}
        onConfirm={adminForcePick}
      >
        <div className="stack stack-sm">
          <label className="field">
            <div className="field-label">Pokémon ID</div>
            <input
              className="input"
              inputMode="numeric"
              value={forcePickPokemonId}
              onChange={(e) => {
                const v = e.target.value.trim();
                setForcePickPokemonId(v ? Number(v) : "");
              }}
              placeholder="e.g. 25"
            />
          </label>

          <label className="field">
            <div className="field-label">Team ID (optional)</div>
            <input
              className="input"
              inputMode="numeric"
              value={forcePickTeamId}
              onChange={(e) => {
                const v = e.target.value.trim();
                setForcePickTeamId(v ? Number(v) : "");
              }}
              placeholder={state?.teamOnTheClock ? `${state.teamOnTheClock.teamId}` : "(auto)"}
            />
            <div className="text-muted mt-xs">Tip: find Pokémon IDs from the Pokédex page.</div>
          </label>
        </div>
      </ConfirmDialog>

      {loading ? (
        <div className="card">
          <div className="card-body">Loading draft…</div>
        </div>
      ) : error ? (
        <EmptyState
          title="Draft failed to load"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={refreshAll}>
              Retry
            </button>
          }
        />
      ) : !lobby || !state || !pool ? (
        <EmptyState title="Draft not ready" description="Missing draft data." action={<button className="btn btn-secondary" onClick={refreshAll}>Refresh</button>} />
      ) : (
        <>
          {!hasTeamContext ? (
            <div className="card">
              <div className="card-header">
                <div className="card-title">You’re not on a team yet</div>
                <div className="card-subtitle">This is the catch-22 breaker.</div>
              </div>
              <div className="card-body">
                <div className="text-muted">
                  The backend draft endpoint <code>/draft/my</code> isn’t available until you have a team in this season.
                  You can still view the lobby, commissioner controls, and the draft pool.
                </div>
                <div className="text-muted mt-sm">
                  Next step: the league owner/commissioner needs to add you to the season draft / create your team entry (or the backend needs to return a clean “no team” response instead of 500).
                </div>
              </div>
            </div>
          ) : null}

          {/* Top grid */}
          <div className="grid grid-2">
            <div className="card">
              <div className="card-header">
                <div className="row row-sm row-between">
                  <div>
                    <div className="card-title">On the clock</div>
                    <div className="card-subtitle">Live draft state</div>
                  </div>
                  {canManage ? <span className="badge badge-outline">Commissioner</span> : null}
                </div>
              </div>
              <div className="card-body">
                {state.teamOnTheClock ? (
                  <div className="stack stack-sm">
                    <div className="heading-md">{state.teamOnTheClock.teamName}</div>
                    <div className="text-muted">
                      Round {state.currentRound} • Pick {state.currentPickInRound} • Overall {state.overallPickNumber}
                    </div>
                    <div className="text-muted">
                      Timer: {state.timer.pickTimerSeconds != null ? `${state.timer.pickTimerSeconds}s` : "—"}
                    </div>
                    {hasTeamContext && isYourTurn ? (
                      <span className="badge badge-success">Your turn</span>
                    ) : (
                      <span className="badge badge-soft">Waiting</span>
                    )}
                  </div>
                ) : (
                  <div className="text-muted">Draft is not currently running.</div>
                )}

                {canManage ? (
                  <div className="mt-md">
                    <div className="divider" />
                    <div className="heading-sm">Commissioner controls</div>
                    <div className="row row-sm mt-sm wrap">
                      <button type="button" className="btn btn-primary" disabled={adminBusy != null} onClick={adminStartOrResume}>
                        {state.status === "Paused" ? "Resume" : "Start"}
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={adminBusy != null || state.status !== "InProgress"} onClick={adminPause}>
                        Pause
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={adminBusy != null} onClick={() => setForcePickOpen(true)}>
                        Force pick
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={adminBusy != null} onClick={() => setConfirmUndoOpen(true)}>
                        Undo last
                      </button>
                      <button type="button" className="btn btn-danger" disabled={adminBusy != null} onClick={() => setConfirmEndOpen(true)}>
                        End
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div className="card-title">Lobby</div>
                <div className="card-subtitle">Order and readiness</div>
              </div>
              <div className="card-body">
                <ul className="list list-divided">
                  {lobby.participants
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((p) => (
                      <li key={p.teamId} className="list-item">
                        <div>
                          <div>
                            <strong>{p.teamName}</strong> {p.isYou ? <span className="badge badge-soft">You</span> : null}
                          </div>
                          <div className="text-muted mt-xs">Pos {p.position} • {p.managerDisplayName ?? "Manager"}</div>
                        </div>
                        {p.isReady ? <span className="badge badge-success">Ready</span> : <span className="badge badge-outline">Not ready</span>}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="layout-two-column">
            <div className="stack">
              <div className="card">
                <div className="card-header">
                  <div className="row row-sm row-between">
                    <div>
                      <div className="card-title">Draft pool</div>
                      <div className="card-subtitle">{onlyAvailable ? "Available only" : "All"} • {pool.total} total</div>
                    </div>
                    <Link className="btn btn-ghost" href="/pokedex">
                      Open Pokédex
                    </Link>
                  </div>
                </div>
                <div className="card-body">
                  <div className="grid grid-3">
                    <label className="field">
                      <div className="field-label">Search</div>
                      <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name…" />
                    </label>
                    <label className="field">
                      <div className="field-label">Type</div>
                      <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="">All</option>
                        {typesForFilter.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <div className="field-label">Availability</div>
                      <button type="button" className="btn btn-secondary" onClick={() => setOnlyAvailable((v) => !v)}>
                        {onlyAvailable ? "Showing available" : "Showing all"}
                      </button>
                    </label>
                  </div>

                  <div className="mt-md">
                    {pool.items.length === 0 ? (
                      <div className="text-muted">No Pokémon match your filters.</div>
                    ) : (
                      <ul className="list list-divided">
                        {pool.items.slice(0, 50).map((p) => {
                          const picked = p.isPicked;
                          const canPickNow = hasTeamContext && state.status === "InProgress" && isYourTurn && !picked;
                          const watch = watchlistSet.has(p.pokemonId);
                          return (
                            <li key={p.pokemonId} className="list-item">
                              <div>
                                <div>
                                  <strong>{p.name}</strong> <span className="text-muted">#{p.pokemonId}</span>
                                </div>
                                <div className="text-muted mt-xs">
                                  {(p.types ?? []).join(" / ")}
                                  {p.baseCost != null ? ` • ${p.baseCost} pts` : ""}
                                  {picked && p.pickedByTeamId ? ` • Drafted by Team ${p.pickedByTeamId}` : ""}
                                </div>
                              </div>
                              <div className="row row-sm">
                                <button type="button" className={watch ? "btn btn-secondary" : "btn btn-ghost"} onClick={() => toggleWatch(p.pokemonId)} disabled={!hasTeamContext}>
                                  {watch ? "Watching" : "Watch"}
                                </button>
                                <button type="button" className="btn btn-primary" disabled={!canPickNow} onClick={() => makePick(p.pokemonId)}>
                                  Pick
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {pool.items.length > 50 ? <div className="text-muted mt-sm">Showing first 50 results. Use search/filter to narrow.</div> : null}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">Picks</div>
                  <div className="card-subtitle">Latest 20</div>
                </div>
                <div className="card-body">
                  {state.picks.length === 0 ? (
                    <div className="text-muted">No picks yet.</div>
                  ) : (
                    <ul className="list list-divided">
                      {state.picks
                        .slice()
                        .sort((a, b) => b.overallPickNumber - a.overallPickNumber)
                        .slice(0, 20)
                        .map((pk) => (
                          <li key={pk.id} className="list-item">
                            <div>
                              <div>
                                <strong>
                                  #{pk.overallPickNumber} • {pk.teamName ?? `Team ${pk.teamId}`}
                                </strong>
                              </div>
                              <div className="text-muted mt-xs">
                                Round {pk.round} Pick {pk.pickInRound} • Pokémon #{pk.pokemonId}
                              </div>
                            </div>
                            <Link className="btn btn-ghost" href={`/pokedex?pokemonId=${pk.pokemonId}`}>
                              View
                            </Link>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="stack">
              {my ? (
                <>
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Your draft</div>
                      <div className="card-subtitle">{my.teamName} • Position {youParticipant?.position ?? "—"}</div>
                    </div>
                    <div className="card-body">
                      <div className="grid grid-2">
                        <div className="card card-subtle">
                          <div className="card-body">
                            <div className="text-muted">Picks</div>
                            <div className="heading-md">{my.picks.length}</div>
                          </div>
                        </div>
                        <div className="card card-subtle">
                          <div className="card-body">
                            <div className="text-muted">Draft status</div>
                            <div className="heading-md">{badge.label}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Watchlist</div>
                      <div className="card-subtitle">Quick picks when it&apos;s your turn</div>
                    </div>
                    <div className="card-body">
                      {watchlistItems.length === 0 ? (
                        <div className="text-muted">Nothing on your watchlist yet.</div>
                      ) : (
                        <ul className="list list-divided">
                          {watchlistItems.slice(0, 10).map((p) => {
                            const canPickNow = state.status === "InProgress" && isYourTurn && !p.isPicked;
                            return (
                              <li key={p.pokemonId} className="list-item">
                                <div>
                                  <div>
                                    <strong>{p.name}</strong> <span className="text-muted">#{p.pokemonId}</span>
                                  </div>
                                  <div className="text-muted mt-xs">{(p.types ?? []).join(" / ")}</div>
                                </div>
                                <div className="row row-sm">
                                  <button type="button" className="btn btn-ghost" onClick={() => toggleWatch(p.pokemonId)}>
                                    Remove
                                  </button>
                                  <button type="button" className="btn btn-primary" disabled={!canPickNow} onClick={() => makePick(p.pokemonId)}>
                                    Pick
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card card-subtle">
                  <div className="card-body">
                    <div className="heading-sm">Your draft</div>
                    <div className="text-muted mt-xs">
                      You don’t have a team yet, so personal draft actions are disabled.
                    </div>
                  </div>
                </div>
              )}

              <div className="card card-subtle">
                <div className="card-body">
                  <div className="text-muted">Draft starts</div>
                  <div className="heading-md">{formatDateTime(lobby.startsAt)}</div>
                  <div className="text-muted mt-xs">
                    Type: {lobby.type} • Rounds: {lobby.roundCount ?? "—"} • Timer: {lobby.pickTimerSeconds ?? "—"}s
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
