"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiFetchJson, ApiError } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

type SeasonStatus =
  | "Signup"
  | "Drafting"
  | "Active"
  | "Playoffs"
  | "Completed"
  | "Archived"
  | string;

type SeasonView = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    status: SeasonStatus;
    formatType: string;
    startsAt: string | null;
    endsAt: string | null;
  };
};

type SeasonTeamsResponse = {
  seasonId: number;
  teams: Array<{
    teamId: number;
    name: string;
    logoUrl: string | null;
  }>;
};

type SeasonMatch = {
  matchId: number;
  seasonId?: number;
  round?: number | null;
  scheduledAt?: string | null;

  teamAId: number;
  teamBId: number;

  completedAt?: string | null;
  winnerTeamId?: number | null;
  scoreTeamA?: number | null;
  scoreTeamB?: number | null;
};

type SeasonMatchesResponse =
  | {
      seasonId: number;
      matches: Array<SeasonMatch>;
    }
  | Array<SeasonMatch>;

type MatchUiStatus = "Unscheduled" | "Scheduled" | "Completed";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function matchStatus(m: SeasonMatch): MatchUiStatus {
  if (m.completedAt || m.winnerTeamId != null || m.scoreTeamA != null || m.scoreTeamB != null) {
    return "Completed";
  }
  if (m.scheduledAt) return "Scheduled";
  return "Unscheduled";
}

export default function SeasonMatchesPage() {
  const params = useParams<{ leagueId: string; seasonId: string }>();
  const leagueId = Number(params?.leagueId);
  const seasonId = Number(params?.seasonId);

  const [season, setSeason] = useState<SeasonView["season"] | null>(null);
  const [teams, setTeams] = useState<SeasonTeamsResponse | null>(null);
  const [matches, setMatches] = useState<SeasonMatch[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<MatchUiStatus | "All">("All");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const teamNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of teams?.teams ?? []) {
      map.set(t.teamId, t.name);
    }
    return map;
  }, [teams]);

  const availableRounds = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches) {
      if (typeof m.round === "number") set.add(m.round);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (roundFilter !== "all") {
        const r = Number(roundFilter);
        if (!Number.isFinite(r) || m.round !== r) return false;
      }
      if (statusFilter !== "All") {
        if (matchStatus(m) !== statusFilter) return false;
      }
      if (teamFilter !== "all") {
        const t = Number(teamFilter);
        if (!Number.isFinite(t)) return false;
        if (m.teamAId !== t && m.teamBId !== t) return false;
      }
      return true;
    });
  }, [matches, roundFilter, statusFilter, teamFilter]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [sv, tv, mv] = await Promise.all([
        apiFetchJson<SeasonView>(`/seasons/${seasonId}`),
        apiFetchJson<SeasonTeamsResponse>(`/seasons/${seasonId}/teams`),
        apiFetchJson<SeasonMatchesResponse>(`/seasons/${seasonId}/matches`)
      ]);

      setSeason(sv.season ?? null);
      setTeams(tv);

      const list = Array.isArray(mv) ? mv : mv.matches;
      setMatches(list ?? []);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load matches";
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
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  return (
    <PageShell>
      <PageHeader
        title="Matches"
        subtitle={
          season
            ? `${season.name} • ${season.status}`
            : Number.isFinite(seasonId)
            ? `Season #${seasonId}`
            : "Matches"
        }
        breadcrumb={
          <Link className="link" href={`/leagues/${leagueId}/seasons/${seasonId}`}>
            ← Back to Season
          </Link>
        }
        actions={
          <div className="row row-sm">
            <button type="button" className="btn btn-secondary" onClick={loadAll} disabled={loading}>
              Refresh
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="card">
          <div className="card-body">Loading matches…</div>
        </div>
      ) : error ? (
        <EmptyState
          title="Matches failed to load"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={loadAll}>
              Retry
            </button>
          }
        />
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          description="Fixtures haven’t been generated for this season."
          action={
            <Link className="btn btn-secondary" href={`/leagues/${leagueId}/seasons/${seasonId}`}>
              Back to Season
            </Link>
          }
        />
      ) : (
        <>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Filters</div>
              <div className="card-subtitle">Narrow down matches by round, status, or team.</div>
            </div>
            <div className="card-body">
              <div className="grid grid-3">
                <label className="field">
                  <div className="field-label">Round</div>
                  <select
                    className="input"
                    value={roundFilter}
                    onChange={(e) => setRoundFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    {availableRounds.map((r) => (
                      <option key={r} value={String(r)}>
                        Round {r}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <div className="field-label">Status</div>
                  <select
                    className="input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as MatchUiStatus | "All")}
                  >
                    <option value="All">All</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="Unscheduled">Unscheduled</option>
                    <option value="Completed">Completed</option>
                  </select>
                </label>

                <label className="field">
                  <div className="field-label">Team</div>
                  <select
                    className="input"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                  >
                    <option value="all">All teams</option>
                    {(teams?.teams ?? []).map((t) => (
                      <option key={t.teamId} value={String(t.teamId)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Match list</div>
              <div className="card-subtitle">
                Showing {filteredMatches.length} of {matches.length}
              </div>
            </div>

            <div className="card-body">
              <ul className="list list-divided">
                {filteredMatches.map((m) => {
                  const a = teamNameById.get(m.teamAId) ?? `Team ${m.teamAId}`;
                  const b = teamNameById.get(m.teamBId) ?? `Team ${m.teamBId}`;
                  const status = matchStatus(m);

                  return (
                    <li key={m.matchId} className="list-item">
                      <div>
                        <div className="row row-sm">
                          <span className="badge badge-outline">
                            Round {typeof m.round === "number" ? m.round : "?"}
                          </span>
                          <span className="badge badge-soft">{status}</span>
                          <span className="text-muted">{formatDateTime(m.scheduledAt)}</span>
                        </div>

                        <div className="mt-xs">
                          <strong>{a}</strong> vs <strong>{b}</strong>
                        </div>

                        {status === "Completed" ? (
                          <div className="text-muted mt-xs">
                            {m.scoreTeamA ?? "–"}:{m.scoreTeamB ?? "–"}
                            {m.winnerTeamId ? (
                              <>
                                {" "}
                                • Winner:{" "}
                                <strong>
                                  {teamNameById.get(m.winnerTeamId) ?? `Team ${m.winnerTeamId}`}
                                </strong>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <Link className="btn btn-ghost" href={`/matches/${m.matchId}`}>
                        Open
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
