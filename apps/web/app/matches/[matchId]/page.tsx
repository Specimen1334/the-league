"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type MatchTab = "overview" | "lineups" | "recording";

type HttpErrorWithStatus = Error & { status?: number };

// -----------------------------
// Types – aligned with design docs
// -----------------------------

type MatchStatus =
  | "Scheduled"
  | "InProgress"
  | "AwaitingResult"
  | "Completed"
  | "Voided"
  | "UnderReview"
  | string;

type MatchTeamSide = {
  teamId: number;
  teamName: string;
  logoUrl?: string | null;
  managerName?: string | null;
  score?: number | null;
  wins?: number | null;
  losses?: number | null;
  isYou?: boolean;
};

type MatchOverview = {
  id: number;
  status: MatchStatus;
  leagueId: number;
  leagueName: string;
  seasonId: number;
  seasonName: string;
  roundLabel?: string | null;
  bracketPhase?: string | null;
  scheduledAt?: string | null;
  bestOf?: number | null;
  teamA: MatchTeamSide;
  teamB: MatchTeamSide;
};

type LineupPokemon = {
  id?: number;
  speciesName: string;
  nickname?: string | null;
  itemName?: string | null;
  roleLabel?: string | null;
};

type MatchLineupSide = {
  teamId: number;
  teamName: string;
  isYou: boolean;
  visibilityPhase?: string | null;
  lineupStatusText?: string | null;
  canEdit?: boolean;
  pokemon?: LineupPokemon[];
};

type MatchEventState = "Pending" | "Accepted" | "Disputed" | "Rejected" | string;

type MatchEvent = {
  id: number;
  type: string;
  description: string;
  createdByName?: string | null;
  createdAt?: string | null;
  state: MatchEventState;
  upvotes?: number;
  downvotes?: number;
};

type MatchResultState = "Pending" | "Accepted" | "Rejected" | "Superseded" | string;

type MatchResult = {
  id: number;
  proposedByName?: string | null;
  createdAt?: string | null;
  winnerTeamId?: number | null;
  winnerTeamName?: string | null;
  scoreTeamA?: number | null;
  scoreTeamB?: number | null;
  note?: string | null;
  state: MatchResultState;
  upvotes?: number;
  downvotes?: number;
};

// Result proposal form
type ResultFormState = {
  winnerTeamId: number | null;
  scoreTeamA: string;
  scoreTeamB: string;
  note: string;
};

// Event proposal form
type EventFormState = {
  type: string;
  description: string;
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

// -----------------------------
// Mapping helpers (snake/camel tolerant)
// -----------------------------

function mapTeamSide(raw: any): MatchTeamSide {
  return {
    teamId: raw.teamId ?? raw.team_id,
    teamName: raw.teamName ?? raw.team_name ?? "Team",
    logoUrl: raw.logoUrl ?? raw.logo_url ?? null,
    managerName:
      raw.managerName ??
      raw.manager_name ??
      raw.managerDisplayName ??
      null,
    score:
      typeof raw.score === "number"
        ? raw.score
        : typeof raw.points === "number"
        ? raw.points
        : null,
    wins: raw.wins ?? null,
    losses: raw.losses ?? null,
    isYou: Boolean(raw.isYou ?? raw.is_you ?? false)
  };
}

function mapMatchOverview(raw: any): MatchOverview {
  // Some backends use {teamA, teamB}; others embed them differently.
  const teamARaw =
    raw.teamA ??
    raw.team_a ??
    raw.sideA ??
    raw.side_a ??
    raw.teams?.[0] ??
    {};
  const teamBRaw =
    raw.teamB ??
    raw.team_b ??
    raw.sideB ??
    raw.side_b ??
    raw.teams?.[1] ??
    {};

  return {
    id: raw.id ?? raw.matchId ?? raw.match_id,
    status: (raw.status ?? "Scheduled") as MatchStatus,
    leagueId: raw.leagueId ?? raw.league_id,
    leagueName: raw.leagueName ?? raw.league_name ?? "League",
    seasonId: raw.seasonId ?? raw.season_id,
    seasonName: raw.seasonName ?? raw.season_name ?? "Season",
    roundLabel:
      raw.roundLabel ??
      raw.round_label ??
      raw.roundName ??
      raw.round ??
      null,
    bracketPhase: raw.bracketPhase ?? raw.bracket_phase ?? null,
    scheduledAt: raw.scheduledAt ?? raw.scheduled_at ?? null,
    bestOf:
      typeof raw.bestOf === "number"
        ? raw.bestOf
        : typeof raw.best_of === "number"
        ? raw.best_of
        : null,
    teamA: mapTeamSide(teamARaw),
    teamB: mapTeamSide(teamBRaw)
  };
}

function mapLineups(raw: any): MatchLineupSide[] {
  const sides =
    Array.isArray(raw.sides) && raw.sides.length
      ? raw.sides
      : Array.isArray(raw.teams) && raw.teams.length
      ? raw.teams
      : Array.isArray(raw)
      ? raw
      : [];

  return (sides as any[]).map((s) => {
    const pokemonRaw = s.pokemon ?? s.slots ?? s.lineup ?? [];
    const pokemon: LineupPokemon[] = (pokemonRaw as any[]).map((p) => ({
      id: p.id ?? p.pokemonInstanceId ?? p.pokemon_instance_id ?? null,
      speciesName:
        p.speciesName ??
        p.species_name ??
        p.name ??
        "Pokémon",
      nickname: p.nickname ?? null,
      itemName: p.itemName ?? p.item_name ?? null,
      roleLabel: p.roleLabel ?? p.role_label ?? p.role ?? null
    }));

    return {
      teamId: s.teamId ?? s.team_id,
      teamName: s.teamName ?? s.team_name ?? "Team",
      isYou: Boolean(s.isYou ?? s.is_you ?? false),
      visibilityPhase:
        s.visibilityPhase ??
        s.visibility_phase ??
        s.phase ??
        null,
      lineupStatusText:
        s.lineupStatusText ??
        s.statusText ??
        s.status_text ??
        null,
      canEdit: Boolean(s.canEdit ?? s.can_edit ?? false),
      pokemon
    };
  });
}

function mapEvents(raw: any): MatchEvent[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((e) => ({
    id: e.id,
    type: e.type ?? e.eventType ?? e.event_type ?? "Event",
    description:
      e.description ??
      e.summary ??
      e.label ??
      "Match event",
    createdByName:
      e.createdByName ??
      e.created_by_name ??
      e.authorName ??
      null,
    createdAt: e.createdAt ?? e.created_at ?? null,
    state: e.state ?? e.status ?? "Pending",
    upvotes: e.upvotes ?? e.votes_up ?? null,
    downvotes: e.downvotes ?? e.votes_down ?? null
  }));
}

function mapResults(raw: any): MatchResult[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((r) => ({
    id: r.id,
    proposedByName:
      r.proposedByName ??
      r.proposed_by_name ??
      r.authorName ??
      null,
    createdAt: r.createdAt ?? r.created_at ?? null,
    winnerTeamId: r.winnerTeamId ?? r.winner_team_id ?? null,
    winnerTeamName:
      r.winnerTeamName ??
      r.winner_team_name ??
      r.winnerName ??
      null,
    scoreTeamA:
      typeof r.scoreTeamA === "number"
        ? r.scoreTeamA
        : typeof r.score_team_a === "number"
        ? r.score_team_a
        : null,
    scoreTeamB:
      typeof r.scoreTeamB === "number"
        ? r.scoreTeamB
        : typeof r.score_team_b === "number"
        ? r.score_team_b
        : null,
    note: r.note ?? r.comment ?? r.summary ?? null,
    state: r.state ?? r.status ?? "Pending",
    upvotes: r.upvotes ?? r.votes_up ?? null,
    downvotes: r.downvotes ?? r.votes_down ?? null
  }));
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

export default function MatchHubPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = Number(params?.matchId);

  const [tab, setTab] = useState<MatchTab>("overview");

  const [overview, setOverview] = useState<MatchOverview | null>(null);
  const [lineups, setLineups] = useState<MatchLineupSide[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingLineups, setLoadingLineups] = useState(true);
  const [loadingRecording, setLoadingRecording] = useState(true);

  const [errorOverview, setErrorOverview] = useState<string | null>(null);
  const [errorLineups, setErrorLineups] = useState<string | null>(null);
  const [errorRecording, setErrorRecording] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [resultForm, setResultForm] = useState<ResultFormState>({
    winnerTeamId: null,
    scoreTeamA: "",
    scoreTeamB: "",
    note: ""
  });
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [resultVoteBusyId, setResultVoteBusyId] = useState<number | null>(
    null
  );

  const [eventForm, setEventForm] = useState<EventFormState>({
    type: "KO",
    description: ""
  });
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [eventVoteBusyId, setEventVoteBusyId] = useState<number | null>(
    null
  );

  // -----------------------------
  // Initial load
  // -----------------------------

  useEffect(() => {
    if (!Number.isFinite(matchId) || matchId <= 0) {
      setGlobalError("Invalid match ID.");
      setLoadingOverview(false);
      setLoadingLineups(false);
      setLoadingRecording(false);
      return;
    }

    let cancelled = false;

    async function loadOverviewAndLineups() {
      setLoadingOverview(true);
      setLoadingLineups(true);
      setErrorOverview(null);
      setErrorLineups(null);

      try {
        const [rawOverview, rawLineups] = await Promise.all([
          fetchJson<any>(`/matches/${matchId}`),
          fetchJson<any>(`/matches/${matchId}/lineups`)
        ]);
        if (cancelled) return;

        const mappedOverview = mapMatchOverview(rawOverview);
        setOverview(mappedOverview);
        setLineups(mapLineups(rawLineups));

        // Initialise result form winner default if possible
        const winnerDefault =
          mappedOverview.status === "Completed"
            ? mappedOverview.teamA.score && mappedOverview.teamB.score
              ? mappedOverview.teamA.score > (mappedOverview.teamB.score ?? 0)
                ? mappedOverview.teamA.teamId
                : mappedOverview.teamB.teamId
              : null
            : null;
        setResultForm((prev) => ({
          ...prev,
          winnerTeamId: prev.winnerTeamId ?? winnerDefault
        }));
      } catch (err: any) {
        if (cancelled) return;
        setErrorOverview(err?.message ?? "Failed to load match overview.");
        setErrorLineups(err?.message ?? "Failed to load match lineups.");
      } finally {
        if (!cancelled) {
          setLoadingOverview(false);
          setLoadingLineups(false);
        }
      }
    }

    async function loadRecording() {
      setLoadingRecording(true);
      setErrorRecording(null);
      try {
        const [rawEvents, rawResults] = await Promise.all([
          fetchJson<any>(`/matches/${matchId}/events`),
          fetchJson<any>(`/matches/${matchId}/results`)
        ]);
        if (cancelled) return;

        setEvents(mapEvents(rawEvents));
        setResults(mapResults(rawResults));
      } catch (err: any) {
        if (cancelled) return;
        setErrorRecording(
          err?.message ?? "Failed to load match recording data."
        );
      } finally {
        if (!cancelled) setLoadingRecording(false);
      }
    }

    loadOverviewAndLineups();
    loadRecording();

    // Light polling while in progress / awaiting result
    let interval: ReturnType<typeof setInterval> | null = null;
    interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const [rawOverview, rawEvents, rawResults] = await Promise.all([
          fetchJson<any>(`/matches/${matchId}`),
          fetchJson<any>(`/matches/${matchId}/events`),
          fetchJson<any>(`/matches/${matchId}/results`)
        ]);
        if (cancelled) return;

        setOverview(mapMatchOverview(rawOverview));
        setEvents(mapEvents(rawEvents));
        setResults(mapResults(rawResults));
      } catch {
        // ignore transient polling errors
      }
    }, 8000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [matchId]);

  // -----------------------------
  // Derived
  // -----------------------------

  const teamA = overview?.teamA ?? null;
  const teamB = overview?.teamB ?? null;

  const yourSide = useMemo(
    () => lineups.find((l) => l.isYou) ?? null,
    [lineups]
  );

  const statusLabel = overview?.status ?? "Match";
  const isCompleted = overview?.status === "Completed";

  const sortedResults = useMemo(
    () =>
      results
        .slice()
        .sort(
          (a, b) =>
            (new Date(b.createdAt ?? 0).getTime() || 0) -
            (new Date(a.createdAt ?? 0).getTime() || 0)
        ),
    [results]
  );

  const sortedEvents = useMemo(
    () =>
      events
        .slice()
        .sort(
          (a, b) =>
            (new Date(a.createdAt ?? 0).getTime() || 0) -
            (new Date(b.createdAt ?? 0).getTime() || 0)
        ),
    [events]
  );

  // -----------------------------
  // Actions – propose result / vote
  // -----------------------------

  async function handleSubmitResult(e: FormEvent) {
    e.preventDefault();
    if (!matchId) return;

    if (!resultForm.winnerTeamId) {
      setGlobalError("Please select a winner before submitting a result.");
      return;
    }

    const scoreA =
      resultForm.scoreTeamA.trim() === ""
        ? null
        : Number(resultForm.scoreTeamA);
    const scoreB =
      resultForm.scoreTeamB.trim() === ""
        ? null
        : Number(resultForm.scoreTeamB);

    if (
      (resultForm.scoreTeamA.trim() !== "" &&
        !Number.isFinite(scoreA as number)) ||
      (resultForm.scoreTeamB.trim() !== "" &&
        !Number.isFinite(scoreB as number))
    ) {
      setGlobalError("Scores must be numeric, or left blank.");
      return;
    }

    setResultSubmitting(true);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(`/matches/${matchId}/results`, {
        method: "POST",
        body: JSON.stringify({
          winnerTeamId: resultForm.winnerTeamId,
          scoreTeamA: scoreA,
          scoreTeamB: scoreB,
          note: resultForm.note || undefined
        })
      });

      const rawResults = await fetchJson<any>(
        `/matches/${matchId}/results`
      );
      setResults(mapResults(rawResults));
      setResultForm((prev) => ({
        ...prev,
        note: ""
      }));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to submit match result proposal."
      );
    } finally {
      setResultSubmitting(false);
    }
  }

  async function voteOnResult(result: MatchResult, vote: "up" | "down") {
    if (!matchId) return;
    setResultVoteBusyId(result.id);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(
        `/matches/${matchId}/results/${result.id}/vote`,
        {
          method: "POST",
          body: JSON.stringify({ vote })
        }
      );

      const rawResults = await fetchJson<any>(
        `/matches/${matchId}/results`
      );
      setResults(mapResults(rawResults));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to vote on result proposal."
      );
    } finally {
      setResultVoteBusyId(null);
    }
  }

  // -----------------------------
  // Actions – propose event / vote
  // -----------------------------

  async function handleSubmitEvent(e: FormEvent) {
    e.preventDefault();
    if (!matchId) return;

    if (!eventForm.description.trim()) {
      setGlobalError("Please describe the event before submitting.");
      return;
    }

    setEventSubmitting(true);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(`/matches/${matchId}/events`, {
        method: "POST",
        body: JSON.stringify({
          type: eventForm.type,
          description: eventForm.description
        })
      });

      const rawEvents = await fetchJson<any>(
        `/matches/${matchId}/events`
      );
      setEvents(mapEvents(rawEvents));
      setEventForm({
        type: "KO",
        description: ""
      });
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to submit match event."
      );
    } finally {
      setEventSubmitting(false);
    }
  }

  async function voteOnEvent(event: MatchEvent, vote: "up" | "down") {
    if (!matchId) return;
    setEventVoteBusyId(event.id);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(
        `/matches/${matchId}/events/${event.id}/vote`,
        {
          method: "POST",
          body: JSON.stringify({ vote })
        }
      );

      const rawEvents = await fetchJson<any>(
        `/matches/${matchId}/events`
      );
      setEvents(mapEvents(rawEvents));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to vote on match event."
      );
    } finally {
      setEventVoteBusyId(null);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="match-hub-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/leagues" className="link">
              Leagues
            </Link>
            {overview && (
              <>
                {" "}
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
            <span className="breadcrumb-current">Match Hub</span>
          </p>
          <h1 className="page-title">
            {teamA && teamB
              ? `${teamA.teamName} vs ${teamB.teamName}`
              : "Match"}
          </h1>
          {overview && (
            <p className="page-subtitle">
              {overview.roundLabel
                ? `${overview.seasonName} • ${overview.roundLabel}`
                : overview.seasonName}
            </p>
          )}
        </div>
        <div className="page-header-actions">
          {overview?.bestOf && (
            <span className="pill pill-outline pill-xs">
              Bo{overview.bestOf}
            </span>
          )}
          <span className="pill pill-soft pill-xs ml-xs">
            {statusLabel}
          </span>
        </div>
      </header>

      {globalError && <div className="form-error">{globalError}</div>}
      {errorOverview && <div className="form-error">{errorOverview}</div>}
      {errorLineups && <div className="form-error">{errorLineups}</div>}
      {errorRecording && (
        <div className="form-error">{errorRecording}</div>
      )}

      {overview && (
        <section className="card match-scorecard mb-lg">
          <div className="card-body match-scorecard-body">
            <div className="match-scorecard-team match-scorecard-team--left">
              <div className="stack stack-xs">
                <span className="text-muted text-xs">
                  Team A
                </span>
                <Link
                  href={`/teams/${overview.teamA.teamId}`}
                  className="pill pill-soft"
                >
                  {overview.teamA.teamName}
                </Link>
                {overview.teamA.managerName && (
                  <span className="text-muted text-xs">
                    Manager: {overview.teamA.managerName}
                  </span>
                )}
              </div>
            </div>

            <div className="match-scorecard-center">
              <div className="match-scorecard-score">
                <span className="match-scorecard-score-num">
                  {overview.teamA.score ?? "—"}
                </span>
                <span className="match-scorecard-score-separator">
                  -
                </span>
                <span className="match-scorecard-score-num">
                  {overview.teamB.score ?? "—"}
                </span>
              </div>
              <div className="stack stack-xs text-center">
                <span className="text-muted text-xs">
                  {overview.scheduledAt
                    ? `Scheduled: ${formatDateTime(
                        overview.scheduledAt
                      )}`
                    : "Time: TBA"}
                </span>
                {overview.bracketPhase && (
                  <span className="text-muted text-xs">
                    {overview.bracketPhase}
                  </span>
                )}
              </div>
            </div>

            <div className="match-scorecard-team match-scorecard-team--right">
              <div className="stack stack-xs text-right">
                <span className="text-muted text-xs">
                  Team B
                </span>
                <Link
                  href={`/teams/${overview.teamB.teamId}`}
                  className="pill pill-soft"
                >
                  {overview.teamB.teamName}
                </Link>
                {overview.teamB.managerName && (
                  <span className="text-muted text-xs">
                    Manager: {overview.teamB.managerName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

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
            (tab === "lineups" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("lineups")}
        >
          Lineups
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "recording" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("recording")}
        >
          Recording & Log
        </button>
      </div>

      <section className="match-tab-content mt-md">
        {tab === "overview" && (
          <OverviewTab
            overview={overview}
            lineups={lineups}
            events={sortedEvents}
            results={sortedResults}
            loadingOverview={loadingOverview}
            loadingRecording={loadingRecording}
          />
        )}

        {tab === "lineups" && (
          <LineupsTab
            lineups={lineups}
            loading={loadingLineups}
            yourSide={yourSide}
          />
        )}

        {tab === "recording" && overview && (
          <RecordingTab
            overview={overview}
            events={sortedEvents}
            results={sortedResults}
            loading={loadingRecording}
            resultForm={resultForm}
            setResultForm={setResultForm}
            onSubmitResult={handleSubmitResult}
            resultSubmitting={resultSubmitting}
            resultVoteBusyId={resultVoteBusyId}
            onVoteResult={voteOnResult}
            eventForm={eventForm}
            setEventForm={setEventForm}
            onSubmitEvent={handleSubmitEvent}
            eventSubmitting={eventSubmitting}
            eventVoteBusyId={eventVoteBusyId}
            onVoteEvent={voteOnEvent}
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
  overview: MatchOverview | null;
  lineups: MatchLineupSide[];
  events: MatchEvent[];
  results: MatchResult[];
  loadingOverview: boolean;
  loadingRecording: boolean;
}) {
  const {
    overview,
    lineups,
    events,
    results,
    loadingOverview,
    loadingRecording
  } = props;

  const teamA = overview?.teamA ?? null;
  const teamB = overview?.teamB ?? null;

  const acceptedResult = useMemo(
    () => results.find((r) => r.state === "Accepted") ?? null,
    [results]
  );

  const latestResult = useMemo(
    () => results[0] ?? null,
    [results]
  );

  const lineupSummary = useMemo(() => {
    const a = lineups.find((l) =>
      teamA ? l.teamId === teamA.teamId : false
    );
    const b = lineups.find((l) =>
      teamB ? l.teamId === teamB.teamId : false
    );
    return { a, b };
  }, [lineups, teamA, teamB]);

  return (
    <div className="layout-two-column match-overview-layout">
      <div className="stack stack-lg">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Match summary</h2>
            <p className="card-subtitle">
              High-level context for this fixture: season, round, and basic
              outcome.
            </p>
          </div>
          <div className="card-body">
            {loadingOverview && !overview && <div>Loading match…</div>}
            {overview && (
              <div className="grid grid-2">
                <div className="metric-card">
                  <div className="metric-label">Season</div>
                  <div className="metric-value">
                    {overview.seasonName}
                  </div>
                  {overview.roundLabel && (
                    <div className="metric-caption text-muted text-xs">
                      {overview.roundLabel}
                    </div>
                  )}
                </div>
                <div className="metric-card">
                  <div className="metric-label">Status</div>
                  <div className="metric-value">
                    {overview.status}
                  </div>
                  {overview.scheduledAt && (
                    <div className="metric-caption text-muted text-xs">
                      {formatDateTime(overview.scheduledAt)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Lineup status</h2>
            <p className="card-subtitle">
              Who has locked their team, and what everyone is allowed to see
              right now.
            </p>
          </div>
          <div className="card-body">
            {lineups.length === 0 && (
              <div className="empty-state">
                Lineup information not available yet.
              </div>
            )}
            {lineups.length > 0 && (
              <div className="grid grid-2">
                {lineupSummary.a && (
                  <LineupSummaryCard side={lineupSummary.a} />
                )}
                {lineupSummary.b && (
                  <LineupSummaryCard side={lineupSummary.b} />
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="stack stack-lg">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Result status</h2>
            <p className="card-subtitle">
              Consensus view of the match outcome, plus the latest proposal.
            </p>
          </div>
          <div className="card-body">
            {loadingRecording && results.length === 0 && (
              <div>Loading result proposals…</div>
            )}
            {results.length === 0 && !loadingRecording && (
              <div className="empty-state">
                No result proposals yet. Once the match is played, trainers
                can submit their version of the outcome.
              </div>
            )}

            {acceptedResult && (
              <div className="card card-subtle mb-md">
                <div className="card-body">
                  <div className="stack stack-xs">
                    <span className="text-muted text-xs">
                      Accepted result
                    </span>
                    <span className="pill pill-soft">
                      {acceptedResult.winnerTeamName
                        ? `${acceptedResult.winnerTeamName} wins`
                        : "Winner: not specified"}
                    </span>
                    <span className="text-muted text-xs">
                      Score:{" "}
                      {acceptedResult.scoreTeamA != null &&
                      acceptedResult.scoreTeamB != null
                        ? `${acceptedResult.scoreTeamA} - ${acceptedResult.scoreTeamB}`
                        : "Not recorded"}
                    </span>
                    {acceptedResult.note && (
                      <span className="text-muted text-xs">
                        “{acceptedResult.note}”
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {latestResult && !acceptedResult && (
              <div className="card card-subtle">
                <div className="card-body">
                  <div className="stack stack-xs">
                    <span className="text-muted text-xs">
                      Latest proposal (state: {latestResult.state})
                    </span>
                    <span className="pill pill-soft">
                      {latestResult.winnerTeamName
                        ? `${latestResult.winnerTeamName} wins`
                        : "Winner: not specified"}
                    </span>
                    <span className="text-muted text-xs">
                      Score:{" "}
                      {latestResult.scoreTeamA != null &&
                      latestResult.scoreTeamB != null
                        ? `${latestResult.scoreTeamA} - ${latestResult.scoreTeamB}`
                        : "Not recorded"}
                    </span>
                    {latestResult.note && (
                      <span className="text-muted text-xs">
                        “{latestResult.note}”
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Recent log events</h2>
            <p className="card-subtitle">
              Snapshot of the live match log from the Recording tab.
            </p>
          </div>
          <div className="card-body">
            {loadingRecording && events.length === 0 && (
              <div>Loading log…</div>
            )}
            {events.length === 0 && !loadingRecording && (
              <div className="empty-state">
                No log events yet. KO / assist / pivotal plays will appear
                here as the community records them.
              </div>
            )}
            {events.length > 0 && (
              <ul className="list list-divided">
                {events.slice(0, 5).map((e) => (
                  <li key={e.id} className="list-item list-item--dense">
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        <span className="pill pill-soft">
                          {e.type}
                        </span>
                        <span className="badge badge-soft ml-xs">
                          {e.state}
                        </span>
                      </div>
                      <div className="list-item-meta-row">
                        <span className="text-muted text-xs">
                          {e.description}
                        </span>
                      </div>
                    </div>
                    <div className="list-item-actions">
                      <span className="text-muted text-xs">
                        {e.createdByName ?? "Unknown"} ·{" "}
                        {formatDateTime(e.createdAt)}
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

function LineupSummaryCard({ side }: { side: MatchLineupSide }) {
  const count = side.pokemon?.length ?? 0;
  return (
    <div className="card card-subtle">
      <div className="card-body">
        <div className="stack stack-xs">
          <span className="text-muted text-xs">
            {side.isYou ? "Your team" : "Team"}
          </span>
          <span className="pill pill-soft">{side.teamName}</span>
          <span className="text-muted text-xs">
            {side.lineupStatusText ??
              (count > 0
                ? `${count} Pokémon visible`
                : "Lineup not available")}
          </span>
          {side.visibilityPhase && (
            <span className="badge badge-soft badge-xs">
              Phase: {side.visibilityPhase}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Lineups tab
// -----------------------------

function LineupsTab(props: {
  lineups: MatchLineupSide[];
  loading: boolean;
  yourSide: MatchLineupSide | null;
}) {
  const { lineups, loading, yourSide } = props;
  const hasAny = lineups.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Lineups</h2>
        <p className="card-subtitle">
          What each side is allowed to see, respecting the phased visibility
          rules for this match.
        </p>
      </div>
      <div className="card-body">
        {loading && !hasAny && <div>Loading lineups…</div>}
        {!loading && !hasAny && (
          <div className="empty-state">
            No lineup data available yet. This usually means lineups haven&apos;t
            been locked.
          </div>
        )}

        {hasAny && (
          <div className="grid grid-2">
            {lineups.map((side) => (
              <div key={side.teamId} className="card card-subtle">
                <div className="card-body">
                  <div className="stack stack-sm">
                    <div className="stack stack-xs">
                      <span className="text-muted text-xs">
                        {side.isYou ? "Your team" : "Team"}
                      </span>
                      <span className="pill pill-soft">
                        {side.teamName}
                      </span>
                      {side.visibilityPhase && (
                        <span className="badge badge-soft badge-xs">
                          Phase: {side.visibilityPhase}
                        </span>
                      )}
                      {side.lineupStatusText && (
                        <span className="text-muted text-xs">
                          {side.lineupStatusText}
                        </span>
                      )}
                    </div>

                    {side.pokemon && side.pokemon.length > 0 ? (
                      <ul className="list list-divided mt-sm">
                        {side.pokemon.map((p, idx) => (
                          <li
                            key={p.id ?? `${side.teamId}-${idx}`}
                            className="list-item list-item--dense"
                          >
                            <div className="list-item-main">
                              <div className="list-item-title-row">
                                <span className="pill pill-soft">
                                  {p.nickname
                                    ? `${p.nickname} (${p.speciesName})`
                                    : p.speciesName}
                                </span>
                                {p.itemName && (
                                  <span className="pill pill-outline pill-xs">
                                    {p.itemName}
                                  </span>
                                )}
                              </div>
                              <div className="list-item-meta-row">
                                {p.roleLabel && (
                                  <span className="text-muted text-xs">
                                    {p.roleLabel}
                                  </span>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="empty-state mt-sm">
                        Lineup is locked but not visible in this phase, or
                        hasn&apos;t been submitted yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {yourSide && (
          <p className="text-muted text-xs mt-md">
            You&apos;re viewing the version of lineups you are allowed to see.
            The opposing team may see different details.
          </p>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// Recording tab
// -----------------------------

function RecordingTab(props: {
  overview: MatchOverview;
  events: MatchEvent[];
  results: MatchResult[];
  loading: boolean;
  resultForm: ResultFormState;
  setResultForm: (f: ResultFormState | ((prev: ResultFormState) => ResultFormState)) => void;
  onSubmitResult: (e: FormEvent) => void;
  resultSubmitting: boolean;
  resultVoteBusyId: number | null;
  onVoteResult: (r: MatchResult, vote: "up" | "down") => void;
  eventForm: EventFormState;
  setEventForm: (f: EventFormState | ((prev: EventFormState) => EventFormState)) => void;
  onSubmitEvent: (e: FormEvent) => void;
  eventSubmitting: boolean;
  eventVoteBusyId: number | null;
  onVoteEvent: (e: MatchEvent, vote: "up" | "down") => void;
}) {
  const {
    overview,
    events,
    results,
    loading,
    resultForm,
    setResultForm,
    onSubmitResult,
    resultSubmitting,
    resultVoteBusyId,
    onVoteResult,
    eventForm,
    setEventForm,
    onSubmitEvent,
    eventSubmitting,
    eventVoteBusyId,
    onVoteEvent
  } = props;

  const teamA = overview.teamA;
  const teamB = overview.teamB;

  return (
    <div className="layout-two-column match-recording-layout">
      {/* LEFT: Results */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Result proposals</h2>
          <p className="card-subtitle">
            Anyone in the season can propose a result; the system settles on
            what the majority confirms, with commissioner overrides as needed.
          </p>
        </div>
        <div className="card-body">
          <form className="stack stack-sm mb-md" onSubmit={onSubmitResult}>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Winner</label>
                <select
                  className="input input-sm"
                  value={resultForm.winnerTeamId ?? ""}
                  onChange={(e) =>
                    setResultForm((prev) => ({
                      ...prev,
                      winnerTeamId: e.target.value
                        ? Number(e.target.value)
                        : null
                    }))
                  }
                >
                  <option value="">Select winner…</option>
                  <option value={teamA.teamId}>
                    {teamA.teamName}
                  </option>
                  <option value={teamB.teamId}>
                    {teamB.teamName}
                  </option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">
                  Score ({teamA.teamName})
                </label>
                <input
                  className="input input-sm"
                  value={resultForm.scoreTeamA}
                  onChange={(e) =>
                    setResultForm((prev) => ({
                      ...prev,
                      scoreTeamA: e.target.value
                    }))
                  }
                  placeholder="e.g. 2"
                />
              </div>
              <div className="field">
                <label className="field-label">
                  Score ({teamB.teamName})
                </label>
                <input
                  className="input input-sm"
                  value={resultForm.scoreTeamB}
                  onChange={(e) =>
                    setResultForm((prev) => ({
                      ...prev,
                      scoreTeamB: e.target.value
                    }))
                  }
                  placeholder="e.g. 1"
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Note (optional)</label>
              <textarea
                className="input input-sm"
                rows={2}
                value={resultForm.note}
                onChange={(e) =>
                  setResultForm((prev) => ({
                    ...prev,
                    note: e.target.value
                  }))
                }
                placeholder="Series summary, DCs, or other context…"
              />
            </div>
            <div className="field-row field-row--end">
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={resultSubmitting}
              >
                {resultSubmitting ? "Submitting…" : "Propose result"}
              </button>
            </div>
          </form>

          {loading && results.length === 0 && (
            <div>Loading existing proposals…</div>
          )}

          {results.length === 0 && !loading && (
            <div className="empty-state">
              No proposals yet. Once the match is finished, trainers can
              submit their version of the result here.
            </div>
          )}

          {results.length > 0 && (
            <ul className="list list-divided">
              {results.map((r) => (
                <li key={r.id} className="list-item">
                  <div className="list-item-main">
                    <div className="list-item-title-row">
                      <span className="pill pill-soft">
                        {r.winnerTeamName
                          ? `${r.winnerTeamName} wins`
                          : "Winner unspecified"}
                      </span>
                      <span className="badge badge-soft ml-xs">
                        {r.state}
                      </span>
                    </div>
                    <div className="list-item-meta-row">
                      <span className="text-muted text-xs">
                        Score:{" "}
                        {r.scoreTeamA != null && r.scoreTeamB != null
                          ? `${r.scoreTeamA} - ${r.scoreTeamB}`
                          : "Not recorded"}
                      </span>
                      <span className="text-muted text-xs ml-sm">
                        By {r.proposedByName ?? "Unknown"} ·{" "}
                        {formatDateTime(r.createdAt)}
                      </span>
                    </div>
                    {r.note && (
                      <p className="text-muted text-xs mt-xs">
                        “{r.note}”
                      </p>
                    )}
                  </div>
                  <div className="list-item-actions">
                    <div className="btn-group btn-group-xs">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        disabled={resultVoteBusyId === r.id}
                        onClick={() => onVoteResult(r, "up")}
                      >
                        👍 {r.upvotes ?? 0}
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        disabled={resultVoteBusyId === r.id}
                        onClick={() => onVoteResult(r, "down")}
                      >
                        👎 {r.downvotes ?? 0}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* RIGHT: Event log */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Live match log</h2>
          <p className="card-subtitle">
            KO / assist / key play log, with crowd-sourced voting to converge
            on an accurate timeline.
          </p>
        </div>
        <div className="card-body">
          <form className="stack stack-sm mb-md" onSubmit={onSubmitEvent}>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Event type</label>
                <select
                  className="input input-sm"
                  value={eventForm.type}
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      type: e.target.value
                    }))
                  }
                >
                  <option value="KO">KO</option>
                  <option value="Assist">Assist</option>
                  <option value="Hazard">Hazard</option>
                  <option value="Status">Status</option>
                  <option value="Momentum">Momentum swing</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field-label">
                Description (who did what?)
              </label>
              <textarea
                className="input input-sm"
                rows={2}
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm((prev) => ({
                    ...prev,
                    description: e.target.value
                  }))
                }
                placeholder='Example: "Garchomp KO&apos;d Corviknight with +2 EQ"'
              />
            </div>
            <div className="field-row field-row--end">
              <button
                type="submit"
                className="btn btn-sm btn-secondary"
                disabled={eventSubmitting}
              >
                {eventSubmitting ? "Adding…" : "Add log event"}
              </button>
            </div>
          </form>

          {loading && events.length === 0 && (
            <div>Loading event log…</div>
          )}

          {events.length === 0 && !loading && (
            <div className="empty-state">
              No events logged yet. As the match progresses, use this space to
              record key moments.
            </div>
          )}

          {events.length > 0 && (
            <ul className="list list-divided">
              {events.map((ev) => (
                <li key={ev.id} className="list-item list-item--dense">
                  <div className="list-item-main">
                    <div className="list-item-title-row">
                      <span className="pill pill-soft">{ev.type}</span>
                      <span className="badge badge-soft ml-xs">
                        {ev.state}
                      </span>
                    </div>
                    <div className="list-item-meta-row">
                      <span className="text-muted text-xs">
                        {ev.description}
                      </span>
                    </div>
                    <div className="list-item-meta-row">
                      <span className="text-muted text-xs">
                        {ev.createdByName ?? "Unknown"} ·{" "}
                        {formatDateTime(ev.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="list-item-actions">
                    <div className="btn-group btn-group-xs">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        disabled={eventVoteBusyId === ev.id}
                        onClick={() => onVoteEvent(ev, "up")}
                      >
                        👍 {ev.upvotes ?? 0}
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        disabled={eventVoteBusyId === ev.id}
                        onClick={() => onVoteEvent(ev, "down")}
                      >
                        👎 {ev.downvotes ?? 0}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card-footer">
          <span className="text-muted text-xs">
            Over time this log can power advanced stats, scouting tools, and
            highlight reels for the season.
          </span>
        </div>
      </div>
    </div>
  );
}
