"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type HttpErrorWithStatus = Error & { status?: number };

type TeamHubTab = "overview" | "lineup" | "matches";

// -----------------------------
// Types (aligned with backend design)
// -----------------------------

type TeamOverview = {
  teamId: number;
  teamName: string;
  logoUrl?: string | null;

  leagueId: number;
  leagueName: string;
  seasonId: number;
  seasonName: string;

  ownerUserId?: number | null;
  ownerDisplayName?: string | null;

  rank?: number | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  points?: number | null;
  streakLabel?: string | null;
  elo?: number | null;

  nextMatch?: TeamMatchSummary | null;
  upcomingMatches: TeamMatchSummary[];
  recentMatches: TeamMatchSummary[];

  notifications: TeamNotification[];
};

type MatchStatus =
  | "Scheduled"
  | "InProgress"
  | "AwaitingResult"
  | "Completed"
  | "Voided"
  | "UnderReview"
  | string;

type TeamMatchSummary = {
  matchId: number;
  opponentTeamId: number;
  opponentTeamName: string;
  scheduledAt?: string | null;
  status: MatchStatus;
  isHome?: boolean;
  roundLabel?: string | null;
  resultLabel?: string | null;
  scoreFor?: number | null;
  scoreAgainst?: number | null;
};

type TeamNotification = {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  createdAt?: string | null;
  linkHref?: string | null;
};

type RosterEntry = {
  pokemonInstanceId: number;
  speciesName: string;
  nickname?: string | null;
  spriteUrl?: string | null;
  roles?: string[];
  tierLabel?: string | null;
  baseCost?: number | null;
  seasonCost?: number | null;
  isActive: boolean;
  slotNumber?: number | null;
};

type RosterPayload = {
  active: RosterEntry[];
  bench: RosterEntry[];
  maxActive: number;
  validationStatus: "OK" | "Incomplete" | "Illegal" | string;
  validationMessages?: string[];
};

// -----------------------------
// Fetch helper
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
    // 204 etc.
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

// -----------------------------
// Mapping helpers (snake/camel tolerant)
// -----------------------------

function mapTeamOverview(raw: any): TeamOverview {
  const recentRaw =
    raw.recentMatches ??
    raw.recent_matches ??
    raw.recent ??
    [];
  const upcomingRaw =
    raw.upcomingMatches ??
    raw.upcoming_matches ??
    raw.upcoming ??
    [];
  const notificationsRaw =
    raw.notifications ??
    raw.alerts ??
    raw.messages ??
    [];

  const mapMatch = (m: any): TeamMatchSummary => ({
    matchId: m.matchId ?? m.id ?? m.match_id,
    opponentTeamId:
      m.opponentTeamId ??
      m.opponent_team_id ??
      m.oppTeamId ??
      m.opp_team_id ??
      0,
    opponentTeamName:
      m.opponentTeamName ??
      m.opponent_team_name ??
      m.opponentName ??
      "Opponent",
    scheduledAt: m.scheduledAt ?? m.scheduled_at ?? null,
    status: (m.status ?? "Scheduled") as MatchStatus,
    isHome: Boolean(m.isHome ?? m.home ?? false),
    roundLabel:
      m.roundLabel ??
      m.round_label ??
      m.roundName ??
      m.round ??
      null,
    resultLabel:
      m.resultLabel ??
      m.result_label ??
      m.result ??
      null,
    scoreFor:
      typeof m.scoreFor === "number"
        ? m.scoreFor
        : typeof m.for === "number"
        ? m.for
        : null,
    scoreAgainst:
      typeof m.scoreAgainst === "number"
        ? m.scoreAgainst
        : typeof m.against === "number"
        ? m.against
        : null
  });

  const notifications: TeamNotification[] = (notificationsRaw as any[]).map(
    (n, idx) => ({
      id: String(n.id ?? n.notificationId ?? n.notification_id ?? idx),
      type: n.type ?? n.kind ?? "notification",
      title: n.title ?? n.summary ?? "Notification",
      message: n.message ?? n.body ?? null,
      createdAt: n.createdAt ?? n.created_at ?? null,
      linkHref:
        n.link ??
        n.href ??
        (n.matchId
          ? `/matches/${n.matchId}`
          : n.seasonId && n.leagueId
          ? `/leagues/${n.leagueId}/seasons/${n.seasonId}`
          : null)
    })
  );

  const upcomingMatches = (upcomingRaw as any[]).map(mapMatch);
  const recentMatches = (recentRaw as any[]).map(mapMatch);

  const nextMatch =
    raw.nextMatch ??
    raw.next_match ??
    upcomingMatches[0] ??
    null;

  return {
    teamId:
      raw.teamId ??
      raw.id ??
      raw.team_id,
    teamName: raw.teamName ?? raw.name ?? "Team",
    logoUrl: raw.logoUrl ?? raw.logo_url ?? null,

    leagueId: raw.leagueId ?? raw.league_id,
    leagueName: raw.leagueName ?? raw.league_name ?? "League",
    seasonId: raw.seasonId ?? raw.season_id,
    seasonName: raw.seasonName ?? raw.season_name ?? "Season",

    ownerUserId:
      raw.ownerUserId ??
      raw.owner_user_id ??
      raw.ownerId ??
      raw.owner_id ??
      null,
    ownerDisplayName:
      raw.ownerDisplayName ??
      raw.owner_display_name ??
      raw.ownerName ??
      null,

    rank:
      typeof raw.rank === "number"
        ? raw.rank
        : typeof raw.standing === "number"
        ? raw.standing
        : null,
    wins: raw.wins ?? null,
    losses: raw.losses ?? null,
    ties: raw.ties ?? raw.draws ?? null,
    points:
      typeof raw.points === "number"
        ? raw.points
        : typeof raw.score === "number"
        ? raw.score
        : null,
    streakLabel:
      raw.streakLabel ??
      raw.streak_label ??
      raw.streak ??
      null,
    elo:
      typeof raw.elo === "number"
        ? raw.elo
        : typeof raw.rating === "number"
        ? raw.rating
        : null,

    nextMatch: nextMatch ? mapMatch(nextMatch) : null,
    upcomingMatches,
    recentMatches,
    notifications
  };
}

function mapRoster(raw: any): RosterPayload {
  const activeRaw =
    raw.active ??
    raw.lineup ??
    raw.current ??
    [];
  const benchRaw =
    raw.bench ??
    raw.reserve ??
    raw.roster ??
    [];

  const mapEntry = (p: any, isActive: boolean): RosterEntry => ({
    pokemonInstanceId:
      p.pokemonInstanceId ??
      p.pokemon_instance_id ??
      p.instanceId ??
      p.id,
    speciesName:
      p.speciesName ??
      p.species_name ??
      p.name ??
      "Pokémon",
    nickname: p.nickname ?? null,
    spriteUrl: p.spriteUrl ?? p.sprite_url ?? null,
    roles:
      p.roles && Array.isArray(p.roles)
        ? p.roles
        : p.tags && Array.isArray(p.tags)
        ? p.tags
        : [],
    tierLabel: p.tierLabel ?? p.tier_label ?? p.tier ?? null,
    baseCost:
      typeof p.baseCost === "number"
        ? p.baseCost
        : typeof p.base_cost === "number"
        ? p.base_cost
        : null,
    seasonCost:
      typeof p.seasonCost === "number"
        ? p.seasonCost
        : typeof p.season_cost === "number"
        ? p.season_cost
        : null,
    isActive,
    slotNumber: p.slotNumber ?? p.slot_number ?? null
  });

  const active: RosterEntry[] = (activeRaw as any[]).map((p) =>
    mapEntry(p, true)
  );
  const bench: RosterEntry[] = (benchRaw as any[]).map((p) =>
    mapEntry(p, false)
  );

  const maxActive =
    raw.maxActive ??
    raw.max_active ??
    raw.maxLineupSize ??
    6;

  const validationStatus =
    raw.validationStatus ??
    raw.validation_status ??
    "OK";

  const validationMessages: string[] =
    Array.isArray(raw.validationMessages ?? raw.validation_messages)
      ? (raw.validationMessages ?? raw.validation_messages)
      : [];

  return {
    active,
    bench,
    maxActive,
    validationStatus,
    validationMessages
  };
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

export default function TeamHubPage() {
  const params = useParams<{ teamId: string }>();
  const searchParams = useSearchParams();

  const teamId = Number(params?.teamId);
  const [seasonIdInput, setSeasonIdInput] = useState(
    searchParams?.get("seasonId") ?? ""
  );

  const seasonId = useMemo(() => {
    const fromQuery = searchParams?.get("seasonId");
    if (fromQuery && Number(fromQuery)) return Number(fromQuery);
    if (Number(seasonIdInput)) return Number(seasonIdInput);
    return null;
  }, [searchParams, seasonIdInput]);

  const [tab, setTab] = useState<TeamHubTab>("overview");

  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [roster, setRoster] = useState<RosterPayload | null>(null);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [overviewError, setOverviewError] = useState<string | null>(
    null
  );
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [lineupSaving, setLineupSaving] = useState(false);
  const [seasonHintDismissed, setSeasonHintDismissed] =
    useState(false);

  // -----------------------------
  // Load overview when teamId / seasonId changes
  // -----------------------------

  useEffect(() => {
    if (!Number.isFinite(teamId) || teamId <= 0) {
      setGlobalError("Invalid team ID.");
      setLoadingOverview(false);
      return;
    }

    let cancelled = false;

    async function loadOverview() {
      setLoadingOverview(true);
      setOverviewError(null);
      setGlobalError(null);

      try {
        let raw: any;
        if (seasonId != null) {
          raw = await fetchJson<any>(
            `/seasons/${seasonId}/teams/${teamId}`
          );
        } else {
          // Fallback: team-only endpoint without explicit season
          raw = await fetchJson<any>(`/teams/${teamId}`);
        }

        if (cancelled) return;
        const mapped = mapTeamOverview(raw);
        setOverview(mapped);
      } catch (err: any) {
        if (cancelled) return;
        setOverviewError(
          err?.message ??
            "Failed to load team overview. Try selecting a season."
        );
      } finally {
        if (!cancelled) setLoadingOverview(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [teamId, seasonId]);

  // -----------------------------
  // Load roster whenever seasonId is present
  // -----------------------------

  useEffect(() => {
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return;
    }
    if (seasonId == null) {
      setRoster(null);
      setRosterError(null);
      return;
    }

    let cancelled = false;

    async function loadRoster() {
      setLoadingRoster(true);
      setRosterError(null);
      try {
        const raw = await fetchJson<any>(
          `/seasons/${seasonId}/teams/${teamId}/roster`
        );
        if (cancelled) return;
        setRoster(mapRoster(raw));
      } catch (err: any) {
        if (cancelled) return;
        setRosterError(
          err?.message ?? "Failed to load team roster."
        );
      } finally {
        if (!cancelled) setLoadingRoster(false);
      }
    }

    loadRoster();
    return () => {
      cancelled = true;
    };
  }, [teamId, seasonId]);

  // -----------------------------
  // Derived data
  // -----------------------------

  const activeEntries = roster?.active ?? [];
  const benchEntries = roster?.bench ?? [];
  const maxActive = roster?.maxActive ?? 6;

  const totalActive = activeEntries.length;

  const allMatches: TeamMatchSummary[] = useMemo(() => {
    if (!overview) return [];
    const ids = new Set<number>();
    const combined: TeamMatchSummary[] = [];

    const addList = (items: TeamMatchSummary[]) => {
      for (const m of items) {
        if (ids.has(m.matchId)) continue;
        ids.add(m.matchId);
        combined.push(m);
      }
    };

    addList(overview.upcomingMatches);
    addList(overview.recentMatches);

    return combined.sort((a, b) => {
      const da = new Date(a.scheduledAt ?? "").getTime() || 0;
      const db = new Date(b.scheduledAt ?? "").getTime() || 0;
      return da - db;
    });
  }, [overview]);

  const validationBadgeClass =
    roster?.validationStatus === "OK"
      ? "badge badge-soft badge-xs"
      : roster?.validationStatus === "Incomplete"
      ? "badge badge-soft badge-xs"
      : "badge badge-soft badge-xs badge-danger";

  // -----------------------------
  // Actions – toggle lineup and save
  // -----------------------------

  function toggleActive(entry: RosterEntry) {
    if (!roster) return;

    // If making active & already at cap, do nothing
    if (!entry.isActive && roster.active.length >= maxActive) {
      setGlobalError(
        `You can only have ${maxActive} active Pokémon in your lineup.`
      );
      return;
    }

    const newActive: RosterEntry[] = [];
    const newBench: RosterEntry[] = [];

    const entries = [...roster.active, ...roster.bench].map(
      (p) =>
        p.pokemonInstanceId === entry.pokemonInstanceId
          ? { ...p, isActive: !p.isActive }
          : p
    );

    for (const p of entries) {
      if (p.isActive) newActive.push(p);
      else newBench.push(p);
    }

    setRoster({
      ...roster,
      active: newActive,
      bench: newBench
    });
  }

  async function saveLineup(e: FormEvent) {
    e.preventDefault();
    if (!roster || seasonId == null || !teamId) return;

    const activeIds = roster.active.map(
      (p) => p.pokemonInstanceId
    );

    setLineupSaving(true);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(
        `/seasons/${seasonId}/teams/${teamId}/lineup`,
        {
          method: "POST",
          body: JSON.stringify({
            pokemonInstanceIds: activeIds
          })
        }
      );

      // Refresh roster to get updated validation state
      const raw = await fetchJson<any>(
        `/seasons/${seasonId}/teams/${teamId}/roster`
      );
      setRoster(mapRoster(raw));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to save lineup."
      );
    } finally {
      setLineupSaving(false);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------

  const showSeasonHint =
    seasonId == null &&
    !seasonHintDismissed;

  return (
    <main className="team-hub-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/dashboard" className="link">
              Dashboard
            </Link>
            {overview && (
              <>
                {" "}
                /{" "}
                <Link
                  href="/leagues"
                  className="link"
                >
                  Leagues
                </Link>{" "}
                /{" "}
                <Link
                  href={`/leagues/${overview.leagueId}`}
                  className="link"
                >
                  {overview.leagueName}
                </Link>{" "}
                /{" "}
                <Link
                  href={`/leagues/${overview.leagueId}/seasons/${overview.seasonId}`}
                  className="link"
                >
                  {overview.seasonName}
                </Link>{" "}
                /{" "}
              </>
            )}
            <span className="breadcrumb-current">
              Team Hub
            </span>
          </p>
          <h1 className="page-title">
            {overview?.teamName ?? "Team"}
          </h1>
          {overview && (
            <p className="page-subtitle">
              {overview.seasonName} •{" "}
              {overview.leagueName}
            </p>
          )}
        </div>

        <div className="page-header-actions">
          {/* Season selector (simple numeric for now) */}
          <div className="card card-subtle team-context-card">
            <div className="card-body">
              <div className="stack stack-xs">
                <span className="text-muted text-xxs">
                  Active season context
                </span>
                <div className="field-row field-row--dense">
                  <div className="field">
                    <label className="field-label text-xxs">
                      Season ID
                    </label>
                    <input
                      className="input input-xs"
                      value={seasonIdInput}
                      onChange={(e) =>
                        setSeasonIdInput(e.target.value)
                      }
                      placeholder={
                        overview?.seasonId
                          ? String(overview.seasonId)
                          : "e.g. 1"
                      }
                    />
                  </div>
                </div>
                <span className="text-muted text-xxs">
                  Lineup & roster and match data use this
                  season ID.
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {globalError && (
        <div className="form-error">{globalError}</div>
      )}
      {overviewError && (
        <div className="form-error">{overviewError}</div>
      )}
      {rosterError && (
        <div className="form-error">{rosterError}</div>
      )}

      {showSeasonHint && (
        <div className="card card-subtle mb-md">
          <div className="card-body">
            <div className="field-row field-row--space-between">
              <span className="text-muted text-xs">
                For full lineup and match data, set a
                <strong> seasonId</strong> in the header. If you
                open this page from Season Hub, the link can
                include it automatically (e.g.
                <code className="code-inline">
                  {" "}
                  /teams/{teamId}?seasonId=3
                </code>
                ).
              </span>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={() =>
                  setSeasonHintDismissed(true)
                }
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score / record header */}
      {overview && (
        <section className="card team-scorecard mb-lg">
          <div className="card-body team-scorecard-body">
            <div className="team-scorecard-main">
              <div className="team-scorecard-logo">
                {overview.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={overview.logoUrl}
                    alt={overview.teamName}
                    className="team-avatar"
                  />
                ) : (
                  <div className="team-avatar team-avatar--placeholder">
                    {overview.teamName
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
              </div>
              <div className="stack stack-xs">
                <span className="text-muted text-xs">
                  Team
                </span>
                <h2 className="section-title">
                  {overview.teamName}
                </h2>
                <div className="pill-row">
                  {overview.rank != null && (
                    <span className="pill pill-soft pill-xs">
                      Rank #{overview.rank}
                    </span>
                  )}
                  {overview.points != null && (
                    <span className="pill pill-outline pill-xs">
                      {overview.points} pts
                    </span>
                  )}
                  {overview.streakLabel && (
                    <span className="badge badge-soft badge-xs">
                      {overview.streakLabel}
                    </span>
                  )}
                  {overview.elo != null && (
                    <span className="badge badge-soft badge-xs">
                      ELO {overview.elo}
                    </span>
                  )}
                </div>
                {overview.ownerDisplayName && (
                  <span className="text-muted text-xxs">
                    Manager:{" "}
                    {overview.ownerUserId ? (
                      <Link
                        href={`/profile?userId=${overview.ownerUserId}`}
                        className="link"
                      >
                        {overview.ownerDisplayName}
                      </Link>
                    ) : (
                      overview.ownerDisplayName
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="team-scorecard-record">
              <div className="stack stack-xs text-right">
                <span className="text-muted text-xs">
                  Record
                </span>
                <span className="team-record-value">
                  {overview.wins ?? 0} -{" "}
                  {overview.losses ?? 0}
                  {overview.ties != null
                    ? ` - ${overview.ties}`
                    : ""}
                </span>
                {overview.nextMatch && (
                  <span className="text-muted text-xxs">
                    Next: vs{" "}
                    {overview.nextMatch.opponentTeamName} •{" "}
                    {formatDateTime(
                      overview.nextMatch.scheduledAt
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="tabs tabs--underline">
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "overview" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "lineup" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("lineup")}
        >
          Lineup & roster
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "matches" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("matches")}
        >
          Matches
        </button>
      </div>

      <section className="team-hub-tab mt-md">
        {tab === "overview" && (
          <OverviewTab
            overview={overview}
            loading={loadingOverview}
          />
        )}

        {tab === "lineup" && (
          <LineupTab
            roster={roster}
            loading={loadingRoster}
            maxActive={maxActive}
            validationStatus={validationStatus}
            validationMessages={validationMessages}
            validationBadgeClass={validationBadgeClass}
            onToggleActive={toggleActive}
            onSave={saveLineup}
            lineupSaving={lineupSaving}
          />
        )}

        {tab === "matches" && (
          <MatchesTab
            matches={allMatches}
            loading={loadingOverview}
          />
        )}
      </section>
    </main>
  );
}

// -----------------------------
// Overview tab
// -----------------------------

function OverviewTab(props: {
  overview: TeamOverview | null;
  loading: boolean;
}) {
  const { overview, loading } = props;

  if (loading && !overview) {
    return <div>Loading team overview…</div>;
  }

  if (!overview) {
    return (
      <div className="empty-state">
        Team overview not available yet.
      </div>
    );
  }

  const { upcomingMatches, recentMatches, notifications } =
    overview;

  return (
    <div className="layout-two-column team-overview-layout">
      <div className="stack stack-lg">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              Season summary
            </h2>
            <p className="card-subtitle">
              How this team is performing within the current
              league season.
            </p>
          </div>
          <div className="card-body">
            <div className="grid grid-3">
              <div className="metric-card">
                <div className="metric-label">
                  Record
                </div>
                <div className="metric-value">
                  {overview.wins ?? 0} -{" "}
                  {overview.losses ?? 0}
                  {overview.ties != null
                    ? ` - ${overview.ties}`
                    : ""}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">
                  Standing
                </div>
                <div className="metric-value">
                  {overview.rank != null
                    ? `#${overview.rank}`
                    : "—"}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">
                  Points
                </div>
                <div className="metric-value">
                  {overview.points ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              Upcoming matches
            </h2>
            <p className="card-subtitle">
              The next fixtures to prepare for.
            </p>
          </div>
          <div className="card-body">
            {upcomingMatches.length === 0 && (
              <div className="empty-state">
                No upcoming matches scheduled yet.
              </div>
            )}
            {upcomingMatches.length > 0 && (
              <ul className="list list-divided">
                {upcomingMatches.slice(0, 5).map((m) => (
                  <li
                    key={m.matchId}
                    className="list-item list-item--dense"
                  >
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        <Link
                          href={`/matches/${m.matchId}`}
                          className="link"
                        >
                          vs {m.opponentTeamName}
                        </Link>
                        {m.roundLabel && (
                          <span className="badge badge-soft badge-xs ml-xs">
                            {m.roundLabel}
                          </span>
                        )}
                      </div>
                      <div className="list-item-meta-row">
                        <span className="text-muted text-xs">
                          {formatDateTime(m.scheduledAt)}
                        </span>
                        <span className="text-muted text-xs ml-sm">
                          {m.status}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="stack stack-lg">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              Recent results
            </h2>
            <p className="card-subtitle">
              How the team has been performing lately.
            </p>
          </div>
          <div className="card-body">
            {recentMatches.length === 0 && (
              <div className="empty-state">
                No completed matches yet.
              </div>
            )}
            {recentMatches.length > 0 && (
              <ul className="list list-divided">
                {recentMatches.slice(0, 5).map((m) => (
                  <li
                    key={m.matchId}
                    className="list-item list-item--dense"
                  >
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        <Link
                          href={`/matches/${m.matchId}`}
                          className="link"
                        >
                          vs {m.opponentTeamName}
                        </Link>
                        {m.resultLabel && (
                          <span className="badge badge-soft badge-xs ml-xs">
                            {m.resultLabel}
                          </span>
                        )}
                      </div>
                      <div className="list-item-meta-row">
                        <span className="text-muted text-xs">
                          {formatDateTime(m.scheduledAt)}
                        </span>
                        {m.scoreFor != null &&
                          m.scoreAgainst != null && (
                            <span className="badge badge-soft badge-xs ml-xs">
                              {m.scoreFor} - {m.scoreAgainst}
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

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">
              Team notifications
            </h2>
            <p className="card-subtitle">
              Invites, rulings, and important updates for this
              team.
            </p>
          </div>
          <div className="card-body">
            {notifications.length === 0 && (
              <div className="empty-state">
                No notifications yet.
              </div>
            )}
            {notifications.length > 0 && (
              <ul className="list list-divided">
                {notifications.slice(0, 6).map((n) => (
                  <li
                    key={n.id}
                    className="list-item list-item--dense"
                  >
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        {n.linkHref ? (
                          <Link
                            href={n.linkHref}
                            className="link"
                          >
                            {n.title}
                          </Link>
                        ) : (
                          <span>{n.title}</span>
                        )}
                        <span className="badge badge-soft badge-xs ml-xs">
                          {n.type}
                        </span>
                      </div>
                      {n.message && (
                        <div className="list-item-meta-row">
                          <span className="text-muted text-xs">
                            {n.message}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="list-item-actions">
                      <span className="text-muted text-xxs">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// -----------------------------
// Lineup & roster tab
// -----------------------------

function LineupTab(props: {
  roster: RosterPayload | null;
  loading: boolean;
  maxActive: number;
  validationStatus: string;
  validationMessages: string[] | null;
  validationBadgeClass: string;
  onToggleActive: (entry: RosterEntry) => void;
  onSave: (e: FormEvent) => void;
  lineupSaving: boolean;
}) {
  const {
    roster,
    loading,
    maxActive,
    validationStatus,
    validationMessages,
    validationBadgeClass,
    onToggleActive,
    onSave,
    lineupSaving
  } = props;

  if (loading && !roster) {
    return <div>Loading roster…</div>;
  }

  if (!roster) {
    return (
      <div className="empty-state">
        Roster is not available yet. Set a valid season in the
        header to load this team&apos;s lineup.
      </div>
    );
  }

  const { active, bench, validationStatus, validationMessages } =
    roster;

  return (
    <form
      className="layout-two-column team-lineup-layout"
      onSubmit={onSave}
    >
      {/* Active lineup */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Active lineup</h2>
          <p className="card-subtitle">
            The 6 Pokémon that will be visible and eligible for
            the upcoming round.
          </p>
        </div>
        <div className="card-body">
          <div className="field-row field-row--space-between mb-sm">
            <div className="stack stack-xxs">
              <span className="text-muted text-xs">
                Active slots
              </span>
              <span className="text-xs">
                {active.length} / {maxActive}
              </span>
            </div>
            <div className="stack stack-xxs text-right">
              <span className="text-muted text-xs">
                Validation
              </span>
              <span className={validationBadgeClass}>
                {validationStatus}
              </span>
            </div>
          </div>

          {validationMessages &&
            validationMessages.length > 0 && (
              <ul className="list list-compact mb-sm">
                {validationMessages.map((m, idx) => (
                  <li
                    key={idx}
                    className="text-muted text-xxs"
                  >
                    • {m}
                  </li>
                ))}
              </ul>
            )}

          {active.length === 0 && (
            <div className="empty-state">
              No active Pokémon selected yet. Toggle entries from
              your roster to move them into the lineup.
            </div>
          )}

          {active.length > 0 && (
            <ul className="list list-divided">
              {active.map((p) => (
                <RosterRow
                  key={p.pokemonInstanceId}
                  entry={p}
                  isActive={true}
                  onToggle={() => onToggleActive(p)}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="card-footer">
          <div className="field-row field-row--end">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={lineupSaving}
            >
              {lineupSaving ? "Saving…" : "Save lineup"}
            </button>
          </div>
        </div>
      </section>

      {/* Bench */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Bench / full roster</h2>
          <p className="card-subtitle">
            Pokémon you own for this season that aren&apos;t currently
            active.
          </p>
        </div>
        <div className="card-body">
          {bench.length === 0 && (
            <div className="empty-state">
              No bench Pokémon – this probably means the roster
              hasn&apos;t been drafted yet.
            </div>
          )}
          {bench.length > 0 && (
            <ul className="list list-divided">
              {bench.map((p) => (
                <RosterRow
                  key={p.pokemonInstanceId}
                  entry={p}
                  isActive={false}
                  onToggle={() => onToggleActive(p)}
                />
              ))}
            </ul>
          )}
          <p className="text-muted text-xxs mt-sm">
            You can have up to {maxActive} active Pokémon at a
            time. The rest stay on the bench and are hidden until
            brought into the lineup.
          </p>
        </div>
      </section>
    </form>
  );
}

function RosterRow(props: {
  entry: RosterEntry;
  isActive: boolean;
  onToggle: () => void;
}) {
  const { entry, isActive, onToggle } = props;
  const {
    speciesName,
    nickname,
    spriteUrl,
    roles,
    seasonCost,
    baseCost
  } = entry;

  return (
    <li className="list-item">
      <div className="list-item-main">
        <div className="list-item-title-row">
          <div className="team-roster-sprite">
            {spriteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={spriteUrl}
                alt={speciesName}
                className="pokedex-sprite"
              />
            ) : (
              <div className="pokedex-sprite-placeholder">
                #
              </div>
            )}
          </div>
          <div className="stack stack-xxs">
            <span className="text-sm">
              {nickname
                ? `${nickname} (${speciesName})`
                : speciesName}
            </span>
            <div className="pill-row">
              {roles &&
                roles.slice(0, 3).map((r) => (
                  <span
                    key={r}
                    className="pill pill-soft pill-xs"
                  >
                    {r}
                  </span>
                ))}
            </div>
          </div>
        </div>
        <div className="list-item-meta-row">
          <span className="text-muted text-xxs">
            Cost:{" "}
            {seasonCost != null
              ? `${seasonCost} pts`
              : baseCost != null
              ? `${baseCost} pts`
              : "—"}
          </span>
        </div>
      </div>
      <div className="list-item-actions">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isActive}
            onChange={onToggle}
          />
          <span className="text-xxs">
            {isActive ? "Active" : "Bench"}
          </span>
        </label>
      </div>
    </li>
  );
}

// -----------------------------
// Matches tab
// -----------------------------

function MatchesTab(props: {
  matches: TeamMatchSummary[];
  loading: boolean;
}) {
  const { matches, loading } = props;

  if (loading && matches.length === 0) {
    return <div>Loading matches…</div>;
  }

  if (matches.length === 0) {
    return (
      <div className="empty-state">
        No matches found for this team in the current season.
      </div>
    );
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">Season matches</h2>
        <p className="card-subtitle">
          All fixtures and results for this team in the current
          season.
        </p>
      </div>
      <div className="card-body">
        <div className="table-wrapper">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Round</th>
                <th>When</th>
                <th>Status</th>
                <th>Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.matchId}>
                  <td>
                    <span>{m.opponentTeamName}</span>
                  </td>
                  <td>
                    <span className="text-muted text-xs">
                      {m.roundLabel ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted text-xs">
                      {formatDateTime(m.scheduledAt)}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-soft badge-xs">
                      {m.status}
                    </span>
                  </td>
                  <td>
                    {m.resultLabel ? (
                      <span className="text-muted text-xs">
                        {m.resultLabel}
                      </span>
                    ) : m.scoreFor != null &&
                      m.scoreAgainst != null ? (
                      <span className="text-muted text-xs">
                        {m.scoreFor} - {m.scoreAgainst}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/matches/${m.matchId}`}
                      className="btn btn-xs btn-ghost"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
