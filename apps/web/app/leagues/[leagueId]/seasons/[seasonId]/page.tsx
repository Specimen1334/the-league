"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type SeasonStatus =
  | "Signup"
  | "Drafting"
  | "Active"
  | "Playoffs"
  | "Completed"
  | "Archived"
  | string;

type SeasonDetail = {
  id: number;
  leagueId: number;
  name: string;
  description: string | null;
  status: SeasonStatus;
  formatType?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxTeams?: number | null;
  teamCount?: number | null;
  yourTeamId?: number | null;
  yourTeamName?: string | null;
  yourDraftStatus?: string | null;
};

type SeasonStandingRow = {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  pointsFor?: number | null;
  pointsAgainst?: number | null;
  streak?: string | null;
};

type SeasonScheduleMatch = {
  matchId: number;
  round: number | null;
  scheduledAt: string | null;
  status: string;
  teamAId: number;
  teamAName: string;
  teamBId: number;
  teamBName: string;
  winnerTeamId?: number | null;
  scoreA?: number | null;
  scoreB?: number | null;
};

type SeasonTeamRow = {
  teamId: number;
  teamName: string;
  ownerDisplayName?: string | null;
  recordSummary?: string | null; // e.g. "3-1-0"
};

// Tabs
type SeasonTab = "overview" | "schedule" | "standings" | "teams";

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

function mapSeasonDetail(raw: any): SeasonDetail {
  return {
    id: raw.id,
    leagueId: raw.leagueId ?? raw.league_id,
    name: raw.name ?? "Unnamed season",
    description: raw.description ?? null,
    status: raw.status ?? "Unknown",
    formatType: raw.formatType ?? raw.format_type ?? null,
    startsAt: raw.startsAt ?? raw.starts_at ?? null,
    endsAt: raw.endsAt ?? raw.ends_at ?? null,
    maxTeams:
      typeof raw.maxTeams === "number"
        ? raw.maxTeams
        : typeof raw.max_teams === "number"
        ? raw.max_teams
        : null,
    teamCount:
      typeof raw.teamCount === "number"
        ? raw.teamCount
        : typeof raw.team_count === "number"
        ? raw.team_count
        : null,
    yourTeamId:
      (raw.yourTeamId ?? raw.your_team_id ?? null) as number | null,
    yourTeamName: raw.yourTeamName ?? raw.your_team_name ?? null,
    yourDraftStatus:
      raw.yourDraftStatus ?? raw.your_draft_status ?? null
  };
}

function mapStandings(raw: any): SeasonStandingRow[] {
  const items = Array.isArray(raw) ? raw : raw?.items ?? [];
  return (items as any[]).map((r) => ({
    teamId: r.teamId ?? r.team_id,
    teamName: r.teamName ?? r.team_name,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
    draws: r.draws ?? 0,
    pointsFor:
      typeof r.pointsFor === "number"
        ? r.pointsFor
        : typeof r.points_for === "number"
        ? r.points_for
        : null,
    pointsAgainst:
      typeof r.pointsAgainst === "number"
        ? r.pointsAgainst
        : typeof r.points_against === "number"
        ? r.points_against
        : null,
    streak: r.streak ?? null
  }));
}

function mapSchedule(raw: any): SeasonScheduleMatch[] {
  // Support both:
  // - flat array
  // - { items: [...] }
  const items = Array.isArray(raw) ? raw : raw?.items ?? [];
  return (items as any[]).map((m) => ({
    matchId: m.id ?? m.matchId ?? m.match_id,
    round: m.round ?? null,
    scheduledAt: m.scheduledAt ?? m.scheduled_at ?? null,
    status: m.status ?? "Unknown",
    teamAId: m.teamAId ?? m.team_a_id,
    teamAName: m.teamAName ?? m.team_a_name ?? "Team A",
    teamBId: m.teamBId ?? m.team_b_id,
    teamBName: m.teamBName ?? m.team_b_name ?? "Team B",
    winnerTeamId:
      typeof m.winnerTeamId === "number"
        ? m.winnerTeamId
        : typeof m.winner_team_id === "number"
        ? m.winner_team_id
        : null,
    scoreA:
      typeof m.scoreA === "number"
        ? m.scoreA
        : typeof m.score_team_a === "number"
        ? m.score_team_a
        : null,
    scoreB:
      typeof m.scoreB === "number"
        ? m.scoreB
        : typeof m.score_team_b === "number"
        ? m.score_team_b
        : null
  }));
}

function mapTeams(raw: any): SeasonTeamRow[] {
  const items = Array.isArray(raw) ? raw : raw?.items ?? [];
  return (items as any[]).map((t) => ({
    teamId: t.teamId ?? t.team_id,
    teamName: t.teamName ?? t.team_name,
    ownerDisplayName:
      t.ownerDisplayName ?? t.owner_display_name ?? null,
    recordSummary:
      t.recordSummary ?? t.record_summary ?? null
  }));
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

export default function SeasonHubPage() {
  const params = useParams<{ leagueId: string; seasonId: string }>();
  const leagueId = Number(params?.leagueId);
  const seasonId = Number(params?.seasonId);

  const [tab, setTab] = useState<SeasonTab>("overview");

  const [season, setSeason] = useState<SeasonDetail | null>(null);
  const [standings, setStandings] = useState<SeasonStandingRow[]>([]);
  const [schedule, setSchedule] = useState<SeasonScheduleMatch[]>([]);
  const [teams, setTeams] = useState<SeasonTeamRow[]>([]);

  const [loadingSeason, setLoadingSeason] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [seasonError, setSeasonError] = useState<string | null>(null);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(leagueId) || !Number.isFinite(seasonId)) {
      setSeasonError("Invalid league or season ID.");
      setLoadingSeason(false);
      return;
    }

    let cancelled = false;

    async function loadSeason() {
      setLoadingSeason(true);
      setSeasonError(null);
      try {
        const raw = await fetchJson<any>(
          `/leagues/${leagueId}/seasons/${seasonId}`
        );
        if (cancelled) return;
        setSeason(mapSeasonDetail(raw));
      } catch (err: any) {
        if (cancelled) return;
        setSeasonError(err?.message ?? "Failed to load season.");
      } finally {
        if (!cancelled) setLoadingSeason(false);
      }
    }

    async function loadStandings() {
      setLoadingStandings(true);
      setStandingsError(null);
      try {
        const raw = await fetchJson<any>(
          `/leagues/${leagueId}/seasons/${seasonId}/standings`
        );
        if (cancelled) return;
        setStandings(mapStandings(raw));
      } catch (err: any) {
        if (cancelled) return;
        setStandingsError(err?.message ?? "Failed to load standings.");
      } finally {
        if (!cancelled) setLoadingStandings(false);
      }
    }

    async function loadSchedule() {
      setLoadingSchedule(true);
      setScheduleError(null);
      try {
        const raw = await fetchJson<any>(
          `/leagues/${leagueId}/seasons/${seasonId}/schedule`
        );
        if (cancelled) return;
        setSchedule(mapSchedule(raw));
      } catch (err: any) {
        if (cancelled) return;
        setScheduleError(err?.message ?? "Failed to load schedule.");
      } finally {
        if (!cancelled) setLoadingSchedule(false);
      }
    }

    async function loadTeams() {
      setLoadingTeams(true);
      setTeamsError(null);
      try {
        const raw = await fetchJson<any>(
          `/leagues/${leagueId}/seasons/${seasonId}/teams`
        );
        if (cancelled) return;
        setTeams(mapTeams(raw));
      } catch (err: any) {
        if (cancelled) return;
        setTeamsError(err?.message ?? "Failed to load teams.");
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    }

    loadSeason();
    loadStandings();
    loadSchedule();
    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [leagueId, seasonId]);

  const yourTeam = useMemo(
    () =>
      season?.yourTeamId
        ? {
            id: season.yourTeamId,
            name: season.yourTeamName ?? "Your team"
          }
        : null,
    [season?.yourTeamId, season?.yourTeamName]
  );

  const groupedSchedule = useMemo(() => {
    const byRound = new Map<number | "unseeded", SeasonScheduleMatch[]>();
    for (const m of schedule) {
      const key = m.round ?? ("unseeded" as const);
      const existing = byRound.get(key) ?? [];
      existing.push(m);
      byRound.set(key, existing);
    }

    const rounds: { round: number | null; matches: SeasonScheduleMatch[] }[] =
      [];
    const numericRounds: number[] = [];

    byRound.forEach((matches, key) => {
      if (key === "unseeded") return;
      numericRounds.push(key as number);
    });
    numericRounds.sort((a, b) => a - b);
    for (const r of numericRounds) {
      rounds.push({ round: r, matches: byRound.get(r)! });
    }
    const unseeded = byRound.get("unseeded");
    if (unseeded && unseeded.length > 0) {
      rounds.push({ round: null, matches: unseeded });
    }

    return rounds;
  }, [schedule]);

  const hasStandings = standings.length > 0;
  const hasSchedule = schedule.length > 0;
  const hasTeams = teams.length > 0;

  return (
    <main className="season-hub-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/leagues" className="link">
              Leagues
            </Link>{" "}
            /{" "}
            <Link href={`/leagues/${leagueId}`} className="link">
              League
            </Link>{" "}
            /{" "}
            <span className="breadcrumb-current">
              {season ? season.name : "Season"}
            </span>
          </p>
          <h1 className="page-title">
            {season ? season.name : "Season Hub"}
          </h1>
          {season?.description && (
            <p className="page-subtitle">{season.description}</p>
          )}
        </div>
        {season && (
          <div className="page-header-actions">
            {yourTeam && (
              <Link
                href={`/teams/${yourTeam.id}`}
                className="btn btn-sm btn-secondary"
              >
                Your team
              </Link>
            )}
            <Link
              href={`/draft/${season.id}`}
              className="btn btn-sm btn-ghost"
            >
              Draft hub
            </Link>
            <Link
              href={`/marketplace/${season.id}`}
              className="btn btn-sm btn-ghost"
            >
              Marketplace
            </Link>
          </div>
        )}
      </header>

      {seasonError && <div className="form-error">{seasonError}</div>}
      {standingsError && <div className="form-error">{standingsError}</div>}
      {scheduleError && <div className="form-error">{scheduleError}</div>}
      {teamsError && <div className="form-error">{teamsError}</div>}

      {season && (
        <section className="card season-meta mb-lg">
          <div className="card-body season-meta-body">
            <div className="season-meta-left">
              <div className="stack stack-xs">
                <span className="pill pill-outline pill-xs">
                  {season.status}
                </span>
                {season.formatType && (
                  <span className="text-muted text-xs">
                    Format: {season.formatType}
                  </span>
                )}
                <span className="text-muted text-xs">
                  {formatDate(season.startsAt)} – {formatDate(season.endsAt)}
                </span>
              </div>
            </div>

            <div className="season-meta-right">
              <div className="stack stack-xs text-right">
                <span className="text-muted text-xs">
                  Teams:{" "}
                  {typeof season.teamCount === "number"
                    ? season.teamCount
                    : "—"}
                  {typeof season.maxTeams === "number"
                    ? ` / ${season.maxTeams}`
                    : ""}
                </span>
                {season.yourDraftStatus && (
                  <span className="pill pill-soft pill-xs">
                    Draft status: {season.yourDraftStatus}
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
            "tabs-item" + (tab === "overview" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={
            "tabs-item" + (tab === "schedule" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("schedule")}
        >
          Schedule
        </button>
        <button
          type="button"
          className={
            "tabs-item" + (tab === "standings" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("standings")}
        >
          Standings
        </button>
        <button
          type="button"
          className={
            "tabs-item" + (tab === "teams" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("teams")}
        >
          Teams
        </button>
      </div>

      <section className="season-tab-content mt-md">
        {tab === "overview" && (
          <OverviewTab
            season={season}
            standings={standings}
            schedule={schedule}
            teams={teams}
            loadingSeason={loadingSeason}
            loadingStandings={loadingStandings}
            loadingSchedule={loadingSchedule}
          />
        )}
        {tab === "schedule" && (
          <ScheduleTab
            leagueId={leagueId}
            groupedSchedule={groupedSchedule}
            loading={loadingSchedule}
          />
        )}
        {tab === "standings" && (
          <StandingsTab
            standings={standings}
            loading={loadingStandings}
          />
        )}
        {tab === "teams" && (
          <TeamsTab
            teams={teams}
            leagueId={leagueId}
            seasonId={seasonId}
            loading={loadingTeams}
            yourTeamId={season?.yourTeamId ?? null}
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
  season: SeasonDetail | null;
  standings: SeasonStandingRow[];
  schedule: SeasonScheduleMatch[];
  teams: SeasonTeamRow[];
  loadingSeason: boolean;
  loadingStandings: boolean;
  loadingSchedule: boolean;
}) {
  const {
    season,
    standings,
    schedule,
    teams,
    loadingSeason,
    loadingStandings,
    loadingSchedule
  } = props;

  const hasStandings = standings.length > 0;
  const hasNextMatch = schedule.length > 0;

  const nextMatch = useMemo(() => {
    const sorted = [...schedule].sort((a, b) => {
      const da = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const db = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return da - db;
    });
    return sorted.find((m) =>
      ["Scheduled", "InProgress", "AwaitingResult"].includes(m.status)
    );
  }, [schedule]);

  const topRow = standings[0];

  return (
    <div className="layout-two-column season-overview-layout">
      <div className="stack stack-lg">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Season snapshot</h2>
            <p className="card-subtitle">
              Status, dates, format, and a quick look at how this season is
              set up.
            </p>
          </div>
          <div className="card-body">
            {loadingSeason && !season && <div>Loading season…</div>}
            {season && (
              <div className="grid grid-3">
                <div className="metric-card">
                  <div className="metric-label">Status</div>
                  <div className="metric-value">{season.status}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Format</div>
                  <div className="metric-value">
                    {season.formatType ?? "—"}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Teams</div>
                  <div className="metric-value">
                    {typeof season.teamCount === "number"
                      ? season.teamCount
                      : "—"}
                    {typeof season.maxTeams === "number"
                      ? ` / ${season.maxTeams}`
                      : ""}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Next match</h2>
            <p className="card-subtitle">
              The closest upcoming fixture in this season.
            </p>
          </div>
          <div className="card-body">
            {loadingSchedule && !hasNextMatch && <div>Loading schedule…</div>}
            {!loadingSchedule && !nextMatch && (
              <div className="empty-state">
                No upcoming matches yet. Check back after fixtures are
                generated.
              </div>
            )}
            {nextMatch && (
              <div className="list-item list-item--dense">
                <div className="list-item-main">
                  <div className="list-item-title-row">
                    <span className="pill pill-soft">
                      {nextMatch.teamAName} vs {nextMatch.teamBName}
                    </span>
                    {nextMatch.round != null && (
                      <span className="pill pill-outline pill-xs">
                        Round {nextMatch.round}
                      </span>
                    )}
                  </div>
                  <div className="list-item-meta-row">
                    <span className="text-muted">
                      {formatDateTime(nextMatch.scheduledAt)}
                    </span>
                    <span className="badge badge-soft ml-sm">
                      {nextMatch.status}
                    </span>
                  </div>
                </div>
                <div className="list-item-actions">
                  <Link
                    href={`/matches/${nextMatch.matchId}`}
                    className="btn btn-xs btn-secondary"
                  >
                    Open match
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="stack stack-lg">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Top of the table</h2>
            <p className="card-subtitle">
              A quick view of standings and the current leader.
            </p>
          </div>
          <div className="card-body">
            {loadingStandings && !hasStandings && (
              <div>Loading standings…</div>
            )}
            {!loadingStandings && !hasStandings && (
              <div className="empty-state">
                No standings yet – matches may not have started.
              </div>
            )}
            {hasStandings && (
              <>
                {topRow && (
                  <div className="card card-subtle mb-md">
                    <div className="card-body">
                      <div className="stack stack-xs">
                        <span className="text-muted text-xs">
                          Currently leading
                        </span>
                        <div className="pill pill-soft">
                          {topRow.teamName}
                        </div>
                        <span className="text-muted text-xs">
                          {topRow.wins}-{topRow.losses}
                          {topRow.draws ? `-${topRow.draws}` : ""} W-L-D
                          {topRow.streak && ` · ${topRow.streak}`}
                        </span>
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
                        <th>W</th>
                        <th>L</th>
                        <th>D</th>
                        <th>PF</th>
                        <th>PA</th>
                        <th>Streak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.slice(0, 6).map((row, index) => (
                        <tr key={row.teamId}>
                          <td>{index + 1}</td>
                          <td>{row.teamName}</td>
                          <td>{row.wins}</td>
                          <td>{row.losses}</td>
                          <td>{row.draws}</td>
                          <td>{row.pointsFor ?? "—"}</td>
                          <td>{row.pointsAgainst ?? "—"}</td>
                          <td>{row.streak ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {standings.length > 6 && (
                  <p className="text-muted text-xs mt-sm">
                    Showing 6 of {standings.length} teams. See the
                    Standings tab for full table.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Teams</h2>
            <p className="card-subtitle">
              Snapshot of teams competing in this season.
            </p>
          </div>
          <div className="card-body">
            {teams.length === 0 && (
              <div className="empty-state">
                No teams yet – league staff may still be registering teams
                or running the draft.
              </div>
            )}
            {teams.length > 0 && (
              <ul className="list list-divided">
                {teams.slice(0, 5).map((t) => (
                  <li key={t.teamId} className="list-item list-item--dense">
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        <span className="pill pill-soft">
                          {t.teamName}
                        </span>
                      </div>
                      <div className="list-item-meta-row">
                        {t.ownerDisplayName && (
                          <span className="text-muted">
                            Manager: {t.ownerDisplayName}
                          </span>
                        )}
                        {t.recordSummary && (
                          <span className="badge badge-soft ml-sm">
                            {t.recordSummary}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="list-item-actions">
                      <Link
                        href={`/teams/${t.teamId}`}
                        className="btn btn-xs btn-ghost"
                      >
                        Team hub
                      </Link>
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
// Schedule tab
// -----------------------------

function ScheduleTab(props: {
  leagueId: number;
  groupedSchedule: { round: number | null; matches: SeasonScheduleMatch[] }[];
  loading: boolean;
}) {
  const { leagueId, groupedSchedule, loading } = props;

  const hasAny = groupedSchedule.some((g) => g.matches.length > 0);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Season schedule</h2>
        <p className="card-subtitle">
          Rounds, fixtures, and results for this season.
        </p>
      </div>
      <div className="card-body">
        {loading && !hasAny && <div>Loading schedule…</div>}
        {!loading && !hasAny && (
          <div className="empty-state">
            No schedule available yet. The commissioner might not have
            generated fixtures.
          </div>
        )}

        {groupedSchedule.map((group) => (
          <div key={group.round ?? "unseeded"} className="mb-md">
            <h3 className="section-subtitle">
              {group.round != null
                ? `Round ${group.round}`
                : "Unseeded / special fixtures"}
            </h3>
            <ul className="list list-divided">
              {group.matches.map((m) => (
                <li key={m.matchId} className="list-item list-item--dense">
                  <div className="list-item-main">
                    <div className="list-item-title-row">
                      <span className="pill pill-soft">
                        {m.teamAName} vs {m.teamBName}
                      </span>
                      <span className="badge badge-soft">{m.status}</span>
                    </div>
                    <div className="list-item-meta-row">
                      <span className="text-muted">
                        {formatDateTime(m.scheduledAt)}
                      </span>
                      {m.scoreA != null && m.scoreB != null && (
                        <span className="badge badge-outline ml-sm">
                          {m.scoreA} – {m.scoreB}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="list-item-actions">
                    <Link
                      href={`/matches/${m.matchId}`}
                      className="btn btn-xs btn-secondary"
                    >
                      Match hub
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="card-footer">
        <span className="text-muted text-xs">
          Detailed match stats and recording live in each Match Hub.
        </span>
      </div>
    </div>
  );
}

// -----------------------------
// Standings tab
// -----------------------------

function StandingsTab(props: {
  standings: SeasonStandingRow[];
  loading: boolean;
}) {
  const { standings, loading } = props;
  const hasAny = standings.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Standings</h2>
        <p className="card-subtitle">
          Full table for this season. Tie-breakers and advanced stats can
          be layered in later.
        </p>
      </div>
      <div className="card-body">
        {loading && !hasAny && <div>Loading standings…</div>}
        {!loading && !hasAny && (
          <div className="empty-state">
            No standings yet. They&apos;ll appear once matches are played.
          </div>
        )}
        {hasAny && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>D</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Streak</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr key={row.teamId}>
                    <td>{index + 1}</td>
                    <td>{row.teamName}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{row.draws}</td>
                    <td>{row.pointsFor ?? "—"}</td>
                    <td>{row.pointsAgainst ?? "—"}</td>
                    <td>{row.streak ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// Teams tab
// -----------------------------

function TeamsTab(props: {
  teams: SeasonTeamRow[];
  leagueId: number;
  seasonId: number;
  loading: boolean;
  yourTeamId: number | null;
}) {
  const { teams, leagueId, seasonId, loading, yourTeamId } = props;
  const hasAny = teams.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Teams in this season</h2>
        <p className="card-subtitle">
          All teams registered for this season, with quick links to team
          hubs.
        </p>
      </div>
      <div className="card-body">
        {loading && !hasAny && <div>Loading teams…</div>}
        {!loading && !hasAny && (
          <div className="empty-state">
            No teams registered yet. They&apos;ll appear after signup or
            draft is complete.
          </div>
        )}

        {hasAny && (
          <ul className="list list-divided">
            {teams.map((t) => {
              const isYourTeam = yourTeamId != null && t.teamId === yourTeamId;
              return (
                <li key={t.teamId} className="list-item list-item--dense">
                  <div className="list-item-main">
                    <div className="list-item-title-row">
                      <span className="pill pill-soft">{t.teamName}</span>
                      {isYourTeam && (
                        <span className="badge badge-accent ml-xs">
                          Your team
                        </span>
                      )}
                    </div>
                    <div className="list-item-meta-row">
                      {t.ownerDisplayName && (
                        <span className="text-muted">
                          Manager: {t.ownerDisplayName}
                        </span>
                      )}
                      {t.recordSummary && (
                        <span className="badge badge-soft ml-sm">
                          {t.recordSummary}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="list-item-actions">
                    <Link
                      href={`/teams/${t.teamId}`}
                      className="btn btn-xs btn-secondary"
                    >
                      Team hub
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card-footer">
        <span className="text-muted text-xs">
          Draft, trades and free agency for this season live in the Draft
          Hub and Marketplace.
        </span>
        <div className="mt-xs">
          <Link
            href={`/draft/${seasonId}`}
            className="btn btn-xs btn-ghost"
          >
            Go to Draft Hub
          </Link>
          <Link
            href={`/marketplace/${seasonId}`}
            className="btn btn-xs btn-ghost ml-xs"
          >
            Go to Marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
