"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type DraftStatus =
  | "NotStarted"
  | "Lobby"
  | "InProgress"
  | "Paused"
  | "Completed"
  | string;

type DraftParticipant = {
  teamId: number;
  teamName: string;
  managerName: string;
  draftPosition: number;
  isReady: boolean;
  isYou?: boolean;
};

type DraftLobby = {
  seasonId: number;
  leagueId: number;
  leagueName: string;
  seasonName: string;
  status: DraftStatus;
  draftType?: string | null;
  startTime?: string | null;
  rosterSize?: number | null;
  numTeams?: number | null;
  rulesSummary?: string | null;
  participants: DraftParticipant[];
};

type DraftState = {
  status: DraftStatus;
  currentRound: number | null;
  currentPickNumber: number | null;
  totalRounds?: number | null;
  teamOnTheClockId?: number | null;
  teamOnTheClockName?: string | null;
  pickDeadlineAt?: string | null;
  picksMade?: number | null;
  totalPicks?: number | null;
};

type DraftPoolEntry = {
  pokemonId: number;
  name: string;
  types: string[];
  tierLabel?: string | null;
  cost?: number | null;
  isPicked: boolean;
  isBanned: boolean;
};

type DraftPick = {
  pickNumber: number;
  round: number | null;
  overall: number | null;
  pokemonId: number;
  pokemonName: string;
};

type DraftMy = {
  teamId: number;
  teamName: string;
  draftPosition?: number | null;
  picks: DraftPick[];
  watchlist: DraftPoolEntry[];
};

type HttpErrorWithStatus = Error & { status?: number };

// -----------------------------
// Fetch helper + mappers
// -----------------------------

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers)
    }
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore parse errors (204 etc.)
  }

  if (!res.ok) {
    const message =
      data?.error || data?.message || `Request failed with status ${res.status}`;
    const err = new Error(message) as HttpErrorWithStatus;
    err.status = res.status;
    throw err;
  }

  return data as T;
}

function mapDraftLobby(raw: any): DraftLobby {
  const participantsRaw = raw.participants ?? raw.teams ?? [];
  const participants: DraftParticipant[] = (participantsRaw as any[]).map(
    (p: any) => ({
      teamId: p.teamId ?? p.team_id,
      teamName: p.teamName ?? p.team_name,
      managerName:
        p.managerName ?? p.manager_name ?? p.managerDisplayName ?? "",
      draftPosition: p.draftPosition ?? p.position ?? 0,
      isReady: Boolean(p.isReady ?? p.ready ?? false),
      isYou: Boolean(p.isYou ?? p.is_you ?? false)
    })
  );

  return {
    seasonId: raw.seasonId ?? raw.season_id,
    leagueId: raw.leagueId ?? raw.league_id,
    leagueName: raw.leagueName ?? raw.league_name ?? "League",
    seasonName: raw.seasonName ?? raw.season_name ?? "Season",
    status: (raw.status ?? "Lobby") as DraftStatus,
    draftType: raw.draftType ?? raw.draft_type ?? null,
    startTime: raw.startTime ?? raw.start_time ?? null,
    rosterSize:
      typeof raw.rosterSize === "number"
        ? raw.rosterSize
        : typeof raw.roster_size === "number"
        ? raw.roster_size
        : null,
    numTeams:
      typeof raw.numTeams === "number"
        ? raw.numTeams
        : typeof raw.num_teams === "number"
        ? raw.num_teams
        : participants.length || null,
    rulesSummary: raw.rulesSummary ?? raw.rules_summary ?? null,
    participants
  };
}

function mapDraftState(raw: any): DraftState {
  return {
    status: (raw.status ?? "Lobby") as DraftStatus,
    currentRound: raw.currentRound ?? raw.round ?? null,
    currentPickNumber: raw.currentPickNumber ?? raw.pick ?? null,
    totalRounds:
      typeof raw.totalRounds === "number"
        ? raw.totalRounds
        : typeof raw.total_rounds === "number"
        ? raw.total_rounds
        : null,
    teamOnTheClockId:
      typeof raw.teamOnTheClockId === "number"
        ? raw.teamOnTheClockId
        : typeof raw.team_on_the_clock_id === "number"
        ? raw.team_on_the_clock_id
        : null,
    teamOnTheClockName:
      raw.teamOnTheClockName ?? raw.team_on_the_clock_name ?? null,
    pickDeadlineAt:
      raw.pickDeadlineAt ?? raw.pick_deadline_at ?? raw.deadline ?? null,
    picksMade:
      typeof raw.picksMade === "number"
        ? raw.picksMade
        : typeof raw.picks_made === "number"
        ? raw.picks_made
        : null,
    totalPicks:
      typeof raw.totalPicks === "number"
        ? raw.totalPicks
        : typeof raw.total_picks === "number"
        ? raw.total_picks
        : null
  };
}

function mapDraftPool(raw: any): DraftPoolEntry[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((p) => ({
    pokemonId: p.pokemonId ?? p.pokemon_id ?? p.id,
    name: p.name,
    types:
      Array.isArray(p.types) && p.types.length > 0
        ? p.types
        : [p.primaryType ?? p.type1 ?? "Unknown"].filter(Boolean),
    tierLabel: p.tierLabel ?? p.tier_label ?? p.tier ?? null,
    cost:
      typeof p.cost === "number"
        ? p.cost
        : typeof p.points === "number"
        ? p.points
        : null,
    isPicked: Boolean(p.isPicked ?? p.picked ?? false),
    isBanned: Boolean(p.isBanned ?? p.banned ?? false)
  }));
}

function mapDraftMy(raw: any): DraftMy {
  const picksRaw = raw.picks ?? raw.drafted ?? [];
  const watchRaw = raw.watchlist ?? [];

  const picks: DraftPick[] = (picksRaw as any[]).map((pk: any) => ({
    pickNumber: pk.pickNumber ?? pk.pick_number ?? pk.slot ?? 0,
    round: pk.round ?? null,
    overall: pk.overall ?? pk.overall_pick ?? null,
    pokemonId: pk.pokemonId ?? pk.pokemon_id,
    pokemonName: pk.pokemonName ?? pk.pokemon_name
  }));

  const watchlist: DraftPoolEntry[] = mapDraftPool(watchRaw);

  return {
    teamId: raw.teamId ?? raw.team_id,
    teamName: raw.teamName ?? raw.team_name ?? "Your team",
    draftPosition: raw.draftPosition ?? raw.draft_position ?? null,
    picks,
    watchlist
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return d.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

// -----------------------------
// Page component
// -----------------------------

export default function DraftHubPage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = Number(params?.seasonId);

  const [lobby, setLobby] = useState<DraftLobby | null>(null);
  const [state, setState] = useState<DraftState | null>(null);
  const [pool, setPool] = useState<DraftPoolEntry[]>([]);
  const [my, setMy] = useState<DraftMy | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingPool, setLoadingPool] = useState(true);
  const [loadingMy, setLoadingMy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [myError, setMyError] = useState<string | null>(null);

  const [globalActionError, setGlobalActionError] = useState<string | null>(
    null
  );
  const [readyLoading, setReadyLoading] = useState(false);
  const [pickLoadingId, setPickLoadingId] = useState<number | null>(null);

  const [poolSearch, setPoolSearch] = useState("");
  const [poolTypeFilter, setPoolTypeFilter] = useState<string>("all");
  const [showPicked, setShowPicked] = useState(false);

  const [selectedPoolId, setSelectedPoolId] = useState<number | null>(null);

  // -----------------------------
  // Initial load
  // -----------------------------

  useEffect(() => {
    if (!Number.isFinite(seasonId) || seasonId <= 0) {
      setError("Invalid season ID.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setPoolError(null);
      setMyError(null);
      setGlobalActionError(null);

      try {
        const [rawLobby, rawState, rawPool, rawMy] = await Promise.all([
          fetchJson<any>(`/seasons/${seasonId}/draft/lobby`),
          fetchJson<any>(`/seasons/${seasonId}/draft/state`),
          fetchJson<any>(`/seasons/${seasonId}/draft/pool`),
          fetchJson<any>(`/seasons/${seasonId}/draft/my`)
        ]);
        if (cancelled) return;

        setLobby(mapDraftLobby(rawLobby));
        setState(mapDraftState(rawState));
        setPool(mapDraftPool(rawPool));
        setMy(mapDraftMy(rawMy));
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load draft hub.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingPool(false);
          setLoadingMy(false);
        }
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  // -----------------------------
  // Poll for live updates while in lobby / in progress
  // -----------------------------

  useEffect(() => {
    if (!seasonId) return;

    let cancelled = false;

    const interval = setInterval(async () => {
      if (cancelled) return;

      try {
        const [rawState, rawMy] = await Promise.all([
          fetchJson<any>(`/seasons/${seasonId}/draft/state`),
          fetchJson<any>(`/seasons/${seasonId}/draft/my`)
        ]);
        if (cancelled) return;

        setState(mapDraftState(rawState));
        setMy(mapDraftMy(rawMy));
      } catch {
        // ignore transient polling errors
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [seasonId]);

  // -----------------------------
  // Actions
  // -----------------------------

  async function toggleReady() {
    if (!seasonId) return;
    setReadyLoading(true);
    setGlobalActionError(null);
    try {
      // Design doc: "toggle ready for your team"
      await fetchJson<unknown>(`/seasons/${seasonId}/draft/ready`, {
        method: "POST",
        body: JSON.stringify({})
      });

      // Re-load lobby + my
      const [rawLobby, rawMy] = await Promise.all([
        fetchJson<any>(`/seasons/${seasonId}/draft/lobby`),
        fetchJson<any>(`/seasons/${seasonId}/draft/my`)
      ]);
      setLobby(mapDraftLobby(rawLobby));
      setMy(mapDraftMy(rawMy));
    } catch (err: any) {
      setGlobalActionError(err?.message ?? "Failed to toggle ready state.");
    } finally {
      setReadyLoading(false);
    }
  }

  async function draftPokemon(pokemon: DraftPoolEntry) {
    if (!seasonId || !state) return;

    setPickLoadingId(pokemon.pokemonId);
    setGlobalActionError(null);

    try {
      await fetchJson<unknown>(`/seasons/${seasonId}/draft/pick`, {
        method: "POST",
        body: JSON.stringify({ pokemonId: pokemon.pokemonId })
      });

      // Refresh state, pool, my
      const [rawState, rawPool, rawMy] = await Promise.all([
        fetchJson<any>(`/seasons/${seasonId}/draft/state`),
        fetchJson<any>(`/seasons/${seasonId}/draft/pool`),
        fetchJson<any>(`/seasons/${seasonId}/draft/my`)
      ]);

      setState(mapDraftState(rawState));
      setPool(mapDraftPool(rawPool));
      setMy(mapDraftMy(rawMy));
      setSelectedPoolId(null);
    } catch (err: any) {
      setGlobalActionError(
        err?.message ?? "Failed to submit draft pick. Check that it's your turn."
      );
    } finally {
      setPickLoadingId(null);
    }
  }

  // -----------------------------
  // Derived state
  // -----------------------------

  const lobbyStatus = state?.status ?? lobby?.status ?? "Lobby";
  const onTheClockTeamId =
    state?.teamOnTheClockId ?? null;
  const onTheClockTeamName =
    state?.teamOnTheClockName ??
    lobby?.participants.find((p) => p.teamId === onTheClockTeamId)?.teamName ??
    null;

  const yourTeamId = my?.teamId ?? lobby?.participants.find((p) => p.isYou)?.teamId ?? null;
  const yourDraftPosition =
    my?.draftPosition ??
    lobby?.participants.find((p) => p.isYou)?.draftPosition ??
    null;

  const isYourTurn =
    onTheClockTeamId != null && yourTeamId != null && onTheClockTeamId === yourTeamId;

  const totalSlots = lobby?.rosterSize ?? null;
  const currentPicksCount = my?.picks.length ?? 0;

  const filteredPool = useMemo(() => {
    let entries = pool;

    if (!showPicked) {
      entries = entries.filter((p) => !p.isPicked && !p.isBanned);
    }

    if (poolTypeFilter !== "all") {
      entries = entries.filter((p) =>
        p.types.map((t) => t.toLowerCase()).includes(poolTypeFilter.toLowerCase())
      );
    }

    if (poolSearch.trim()) {
      const q = poolSearch.trim().toLowerCase();
      entries = entries.filter((p) =>
        p.name.toLowerCase().includes(q)
      );
    }

    return entries;
  }, [pool, poolSearch, poolTypeFilter, showPicked]);

  const selectedPoolEntry =
    selectedPoolId != null
      ? pool.find((p) => p.pokemonId === selectedPoolId) ?? null
      : null;

  const readyStateLabel = useMemo(() => {
    const me = lobby?.participants.find((p) => p.isYou);
    if (!me) return null;
    return me.isReady ? "Ready" : "Not ready";
  }, [lobby?.participants]);

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="draft-hub-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/leagues" className="link">
              Leagues
            </Link>
            {lobby && (
              <>
                {" "}
                /{" "}
                <Link
                  href={`/leagues/${lobby.leagueId}`}
                  className="link"
                >
                  {lobby.leagueName}
                </Link>{" "}
                /{" "}
                <Link
                  href={`/leagues/${lobby.leagueId}/seasons/${lobby.seasonId}`}
                  className="link"
                >
                  {lobby.seasonName}
                </Link>{" "}
                /{" "}
              </>
            )}
            <span className="breadcrumb-current">Draft Hub</span>
          </p>
          <h1 className="page-title">
            {lobby ? `${lobby.seasonName} draft` : "Draft Hub"}
          </h1>
          {lobby?.rulesSummary && (
            <p className="page-subtitle">{lobby.rulesSummary}</p>
          )}
        </div>
        <div className="page-header-actions">
          {lobby && (
            <span className="pill pill-outline pill-xs">
              {lobby.draftType
                ? `Draft type: ${lobby.draftType}`
                : "Draft type: standard"}
            </span>
          )}
          {readyStateLabel && (
            <button
              type="button"
              className="btn btn-sm btn-secondary ml-sm"
              onClick={toggleReady}
              disabled={readyLoading}
            >
              {readyLoading
                ? "Updating…"
                : readyStateLabel === "Ready"
                ? "Set not ready"
                : "Set ready"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      {poolError && <div className="form-error">{poolError}</div>}
      {myError && <div className="form-error">{myError}</div>}
      {globalActionError && (
        <div className="form-error">{globalActionError}</div>
      )}

      {lobby && (
        <section className="card draft-meta mb-lg">
          <div className="card-body draft-meta-body">
            <div className="draft-meta-left">
              <div className="stack stack-xs">
                <div className="pill-row">
                  <span className="pill pill-outline pill-xs">
                    Status: {lobbyStatus}
                  </span>
                  {state?.currentRound != null && (
                    <span className="pill pill-soft pill-xs">
                      Round {state.currentRound}
                    </span>
                  )}
                </div>
                <span className="text-muted text-xs">
                  {lobby.startTime
                    ? `Scheduled: ${formatDateTime(lobby.startTime)}`
                    : "Start time TBA"}
                </span>
                {state?.pickDeadlineAt && (
                  <span className="text-muted text-xs">
                    Pick deadline: {formatDateTime(state.pickDeadlineAt)}
                  </span>
                )}
              </div>
            </div>
            <div className="draft-meta-right">
              <div className="stack stack-xs text-right">
                {yourTeamId && (
                  <span className="text-muted text-xs">
                    Your team: {my?.teamName ?? "Your team"}
                  </span>
                )}
                {yourDraftPosition != null && (
                  <span className="text-muted text-xs">
                    Draft position: {yourDraftPosition}
                  </span>
                )}
                {totalSlots != null && (
                  <span className="text-muted text-xs">
                    Picks: {currentPicksCount} / {totalSlots}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="layout-two-column draft-layout">
        {/* LEFT COLUMN: lobby + your team */}
        <div className="stack stack-lg">
          {/* Lobby / participants */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Draft lobby & live state</h2>
              <p className="card-subtitle">
                See all teams, their ready state, and who&apos;s on the clock.
              </p>
            </div>
            <div className="card-body">
              {loading && !lobby && <div>Loading draft lobby…</div>}
              {lobby && (
                <>
                  {onTheClockTeamName && (
                    <div className="card card-subtle mb-md">
                      <div className="card-body">
                        <div className="stack stack-xs">
                          <span className="text-muted text-xs">
                            Team on the clock
                          </span>
                          <span className="pill pill-soft">
                            {onTheClockTeamName}
                          </span>
                          {isYourTurn && (
                            <span className="badge badge-accent pill-xs">
                              It&apos;s your turn to pick
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="table-wrapper">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Team</th>
                          <th>Manager</th>
                          <th>Ready</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lobby.participants
                          .slice()
                          .sort(
                            (a, b) => a.draftPosition - b.draftPosition
                          )
                          .map((p) => {
                            const isYou =
                              p.isYou || (yourTeamId != null && p.teamId === yourTeamId);
                            return (
                              <tr key={p.teamId}>
                                <td>{p.draftPosition}</td>
                                <td>
                                  <div className="stack stack-xs">
                                    <span>{p.teamName}</span>
                                    {isYou && (
                                      <span className="badge badge-accent pill-xs">
                                        You
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-muted">
                                  {p.managerName}
                                </td>
                                <td>
                                  <span
                                    className={
                                      "badge badge-xs " +
                                      (p.isReady
                                        ? "badge-success"
                                        : "badge-muted")
                                    }
                                  >
                                    {p.isReady ? "Ready" : "Not ready"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Your team / picks */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Your draft</h2>
              <p className="card-subtitle">
                Picks you&apos;ve made so far. This will also power the team
                analyser later.
              </p>
            </div>
            <div className="card-body">
              {loadingMy && !my && <div>Loading your draft…</div>}
              {!loadingMy && !my && (
                <div className="empty-state">
                  No team found for you in this draft.
                </div>
              )}
              {my && (
                <>
                  {my.picks.length === 0 && (
                    <div className="empty-state">
                      You haven&apos;t drafted any Pokémon yet.
                    </div>
                  )}
                  {my.picks.length > 0 && (
                    <ul className="list list-divided">
                      {my.picks
                        .slice()
                        .sort(
                          (a, b) =>
                            (a.overall ?? a.pickNumber) -
                            (b.overall ?? b.pickNumber)
                        )
                        .map((pk) => (
                          <li
                            key={`${pk.round}-${pk.pickNumber}-${pk.pokemonId}`}
                            className="list-item list-item--dense"
                          >
                            <div className="list-item-main">
                              <div className="list-item-title-row">
                                <span className="pill pill-soft">
                                  {pk.pokemonName}
                                </span>
                                <span className="pill pill-outline pill-xs">
                                  Round {pk.round ?? "?"} · Pick{" "}
                                  {pk.pickNumber}
                                </span>
                              </div>
                              <div className="list-item-meta-row">
                                {pk.overall != null && (
                                  <span className="text-muted text-xs">
                                    Overall #{pk.overall}
                                  </span>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Watchlist (read-only for now) */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Watchlist</h2>
              <p className="card-subtitle">
                Your planned picks. This will later support reordering and
                auto-pick logic.
              </p>
            </div>
            <div className="card-body">
              {loadingMy && (!my || my.watchlist.length === 0) && (
                <div>Loading watchlist…</div>
              )}
              {my && my.watchlist.length === 0 && (
                <div className="empty-state">
                  You haven&apos;t added anything to your watchlist yet.
                </div>
              )}
              {my && my.watchlist.length > 0 && (
                <ul className="list list-divided">
                  {my.watchlist.map((p) => (
                    <li
                      key={p.pokemonId}
                      className="list-item list-item--dense"
                    >
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          <span className="pill pill-soft">{p.name}</span>
                          {p.tierLabel && (
                            <span className="pill pill-outline pill-xs">
                              {p.tierLabel}
                            </span>
                          )}
                        </div>
                        <div className="list-item-meta-row">
                          <span className="text-muted text-xs">
                            {p.types.join(" / ")}
                          </span>
                          {p.cost != null && (
                            <span className="badge badge-soft ml-sm">
                              {p.cost} pts
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: pool + selected Pokémon */}
        <div className="stack stack-lg">
          {/* Pool */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Available Pokémon</h2>
              <p className="card-subtitle">
                Search and filter the draft pool. Draft when it&apos;s your
                turn and the mon is available.
              </p>
            </div>
            <div className="card-body">
              {loadingPool && pool.length === 0 && (
                <div>Loading pool…</div>
              )}

              <div className="field-row mb-sm">
                <div className="field">
                  <label className="field-label sr-only" htmlFor="pool-search">
                    Search
                  </label>
                  <input
                    id="pool-search"
                    className="input input-sm"
                    placeholder="Search by name…"
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label sr-only" htmlFor="pool-type">
                    Type
                  </label>
                  <select
                    id="pool-type"
                    className="input input-sm"
                    value={poolTypeFilter}
                    onChange={(e) =>
                      setPoolTypeFilter(e.target.value)
                    }
                  >
                    <option value="all">All types</option>
                    <option value="fire">Fire</option>
                    <option value="water">Water</option>
                    <option value="grass">Grass</option>
                    <option value="electric">Electric</option>
                    <option value="ice">Ice</option>
                    <option value="fighting">Fighting</option>
                    <option value="poison">Poison</option>
                    <option value="ground">Ground</option>
                    <option value="flying">Flying</option>
                    <option value="psychic">Psychic</option>
                    <option value="bug">Bug</option>
                    <option value="rock">Rock</option>
                    <option value="ghost">Ghost</option>
                    <option value="dragon">Dragon</option>
                    <option value="dark">Dark</option>
                    <option value="steel">Steel</option>
                    <option value="fairy">Fairy</option>
                  </select>
                </div>
                <div className="field field--inline">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showPicked}
                      onChange={(e) => setShowPicked(e.target.checked)}
                    />
                    <span>Show picked / banned</span>
                  </label>
                </div>
              </div>

              {filteredPool.length === 0 && !loadingPool && (
                <div className="empty-state">
                  No Pokémon match this filter. Adjust search or filters.
                </div>
              )}

              {filteredPool.length > 0 && (
                <div className="table-wrapper draft-pool-table">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Types</th>
                        <th>Tier</th>
                        <th>Cost</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPool.slice(0, 50).map((p) => {
                        const isSelected = selectedPoolId === p.pokemonId;
                        const disabled =
                          (!showPicked && (p.isPicked || p.isBanned)) ||
                          pickLoadingId === p.pokemonId ||
                          !isYourTurn ||
                          lobbyStatus !== "InProgress";

                        return (
                          <tr
                            key={p.pokemonId}
                            className={
                              isSelected ? "row-selected" : ""
                            }
                          >
                            <td>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() =>
                                  setSelectedPoolId(p.pokemonId)
                                }
                              >
                                {p.name}
                              </button>
                            </td>
                            <td className="text-muted text-xs">
                              {p.types.join(" / ")}
                            </td>
                            <td className="text-muted text-xs">
                              {p.tierLabel ?? "—"}
                            </td>
                            <td className="text-muted text-xs">
                              {p.cost != null ? `${p.cost} pts` : "—"}
                            </td>
                            <td className="text-right">
                              {p.isBanned && (
                                <span className="badge badge-danger badge-xs mr-xs">
                                  Banned
                                </span>
                              )}
                              {p.isPicked && (
                                <span className="badge badge-muted badge-xs mr-xs">
                                  Drafted
                                </span>
                              )}
                              <button
                                type="button"
                                className="btn btn-xs btn-primary"
                                disabled={disabled}
                                onClick={() => draftPokemon(p)}
                              >
                                {pickLoadingId === p.pokemonId
                                  ? "Picking…"
                                  : "Draft"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredPool.length > 50 && (
                    <p className="text-muted text-xs mt-xs">
                      Showing first 50 results. Narrow your search to see
                      specific Pokémon.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Selected Pokémon detail */}
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Pokémon details</h2>
              <p className="card-subtitle">
                Quick summary of the currently selected Pokémon.
              </p>
            </div>
            <div className="card-body">
              {!selectedPoolEntry && (
                <div className="empty-state">
                  Select a Pokémon from the pool to see details.
                </div>
              )}
              {selectedPoolEntry && (
                <div className="stack stack-md">
                  <div className="stack stack-xs">
                    <h3 className="section-title">
                      {selectedPoolEntry.name}
                    </h3>
                    <span className="text-muted text-xs">
                      Types: {selectedPoolEntry.types.join(" / ")}
                    </span>
                  </div>
                  <div className="stack stack-xs">
                    <span className="text-muted text-xs">
                      Tier: {selectedPoolEntry.tierLabel ?? "—"}
                    </span>
                    <span className="text-muted text-xs">
                      Cost:{" "}
                      {selectedPoolEntry.cost != null
                        ? `${selectedPoolEntry.cost} pts`
                        : "—"}
                    </span>
                  </div>
                  <div className="stack stack-xs">
                    {selectedPoolEntry.isBanned && (
                      <span className="badge badge-danger">
                        Banned in this season
                      </span>
                    )}
                    {selectedPoolEntry.isPicked && (
                      <span className="badge badge-muted">
                        Already drafted
                      </span>
                    )}
                  </div>
                  <div className="stack stack-xs">
                    <p className="text-muted text-xs">
                      Deeper stats, roles, and coverage analysis will live
                      here, powered by the Pokedex module.
                    </p>
                  </div>
                  {isYourTurn &&
                    !selectedPoolEntry.isPicked &&
                    !selectedPoolEntry.isBanned &&
                    lobbyStatus === "InProgress" && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={pickLoadingId === selectedPoolEntry.pokemonId}
                        onClick={() => draftPokemon(selectedPoolEntry)}
                      >
                        {pickLoadingId === selectedPoolEntry.pokemonId
                          ? "Picking…"
                          : "Draft this Pokémon"}
                      </button>
                    )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
