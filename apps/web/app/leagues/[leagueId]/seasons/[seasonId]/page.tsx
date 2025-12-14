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
import { HubTile } from "@/components/HubTile";
import { SeasonStatusBadge } from "@/components/SeasonStatusBadge";

type SeasonStatus =
  | "Signup"
  | "Drafting"
  | "Active"
  | "Playoffs"
  | "Completed"
  | "Archived"
  | string;

type SeasonOverviewResponse = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    description: string | null;
    status: SeasonStatus;
    formatType: string;
    startsAt: string | null;
    endsAt: string | null;
    createdAt: string;
  };
  yourTeam?: {
    teamId: number;
    name: string;
    logoUrl: string | null;
  };
  stats: {
    teamCount: number;
    matchCount: number;
    completedMatchCount: number;
  };
  upcomingMatches: {
    matchId: number;
    round: number | null;
    scheduledAt: string | null;
    teamAId: number;
    teamBId: number;
  }[];
  recentResults: {
    matchId: number;
    round: number | null;
    completedAt: string | null;
    winnerTeamId: number | null;
    teamAId: number;
    teamBId: number;
    scoreTeamA: number | null;
    scoreTeamB: number | null;
  }[];
};

type SeasonTeamsResponse = {
  seasonId: number;
  teams: Array<{
    teamId: number;
    name: string;
    logoUrl: string | null;
    managerUserId: number;
    managerDisplayName: string | null;
    record: {
      wins: number;
      losses: number;
      draws: number;
    };
  }>;
};

type LeagueView = {
  league: {
    id: number;
    name: string;
  };
};

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

function primaryCtaForStatus(status: SeasonStatus): {
  label: string;
  href: string;
  kind: "primary" | "secondary";
} {
  if (status === "Signup" || status === "Drafting") {
    return { label: "Go to Draft", href: "#draft", kind: "primary" };
  }
  if (status === "Active" || status === "Playoffs" || status === "Completed") {
    return { label: "View Matches", href: "#matches", kind: "primary" };
  }
  return { label: "Season Archived", href: "#", kind: "secondary" };
}

export default function SeasonHubPage() {
  const params = useParams<{ leagueId: string; seasonId: string }>();
  const leagueId = Number(params?.leagueId);
  const seasonId = Number(params?.seasonId);

  const toast = useToast();

  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [overview, setOverview] = useState<SeasonOverviewResponse | null>(null);
  const [teams, setTeams] = useState<SeasonTeamsResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const teamNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of teams?.teams ?? []) {
      map.set(t.teamId, t.name);
    }
    return map;
  }, [teams]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [ov, teamList] = await Promise.all([
        apiFetchJson<SeasonOverviewResponse>(`/seasons/${seasonId}`),
        apiFetchJson<SeasonTeamsResponse>(`/seasons/${seasonId}/teams`)
      ]);
      setOverview(ov);
      setTeams(teamList);

      // League name is not included in SeasonOverviewResponse; fetch it for the subtitle.
      try {
        const lv = await apiFetchJson<LeagueView>(`/leagues/${leagueId}`);
        setLeagueName(lv.league?.name ?? null);
      } catch {
        setLeagueName(null);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load season";
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
    // leagueId is used only for navigation; allow SeasonOverviewResponse to be source of truth.
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, leagueId]);

  const season = overview?.season ?? null;
  const status = season?.status ?? "Unknown";
  const cta = primaryCtaForStatus(status);

  const yourTeamLink = overview?.yourTeam
    ? `/teams/${overview.yourTeam.teamId}?seasonId=${seasonId}`
    : null;

  const draftHref = `/draft/${seasonId}`;
  const marketplaceHref = `/marketplace/${seasonId}`;
  const teamsHubHref = `/leagues/${leagueId}/seasons/${seasonId}/teams`;

  async function archiveSeason() {
    if (!season) return;
    setArchiveBusy(true);
    try {
      const updated = await apiFetchJson<SeasonOverviewResponse>(
        `/seasons/${seasonId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "Archived" })
        }
      );
      setOverview(updated);
      toast.push({ kind: "success", title: "Season archived" });
      setConfirmArchiveOpen(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to archive season";
      toast.push({ kind: "error", title: "Archive failed", message: msg });
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={season?.name ?? "Season"}
        subtitle={
          leagueName
            ? `${leagueName} • ${status}`
            : season?.leagueId
            ? `League #${season.leagueId} • ${status}`
            : status
        }
        breadcrumb={
          <Link className="link" href={`/leagues/${leagueId}`}>
            ← Back to League
          </Link>
        }
        actions={
          <div className="row row-sm">
            <SeasonStatusBadge status={status} />
            {status !== "Archived" ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmArchiveOpen(true)}
              >
                Archive
              </button>
            ) : null}
          </div>
        }
      />

      <ConfirmDialog
        open={confirmArchiveOpen}
        title="Archive season?"
        description="This will set the season status to Archived. You can still view it, but active workflows should stop."
        confirmLabel="Archive"
        confirmKind="danger"
        isBusy={archiveBusy}
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={archiveSeason}
      />

      {loading ? (
        <div className="card">
          <div className="card-body">Loading season…</div>
        </div>
      ) : error ? (
        <EmptyState
          title="Season failed to load"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={loadAll}>
              Retry
            </button>
          }
        />
      ) : !season ? (
        <EmptyState title="Season not found" description="This season may have been removed." />
      ) : (
        <>
          {/* Status overview */}
          <div className="card">
            <div className="card-header">
              <div className="row row-sm" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="heading-md">Season Overview</div>
                  <div className="text-muted mt-xs">
                    {season.description ?? "No description provided."}
                  </div>
                </div>
                <div className="row row-sm">
                  {cta.href !== "#" ? (
                    <a
                      className={cta.kind === "primary" ? "btn btn-primary" : "btn btn-secondary"}
                      href={cta.href === "#draft" ? draftHref : cta.href}
                    >
                      {cta.href === "#draft" ? "Go to Draft" : cta.label}
                    </a>
                  ) : (
                    <span className="badge badge-soft">Archived</span>
                  )}
                </div>
              </div>
            </div>

            <div className="card-body">
              <div className="grid grid-3">
                <div className="card card-subtle">
                  <div className="card-body">
                    <div className="text-muted">Format</div>
                    <div className="heading-md">{season.formatType}</div>
                  </div>
                </div>

                <div className="card card-subtle">
                  <div className="card-body">
                    <div className="text-muted">Dates</div>
                    <div className="heading-md">
                      {formatDate(season.startsAt)} → {formatDate(season.endsAt)}
                    </div>
                  </div>
                </div>

                <div className="card card-subtle">
                  <div className="card-body">
                    <div className="text-muted">Progress</div>
                    <div className="heading-md">
                      {overview.stats.completedMatchCount}/{overview.stats.matchCount} matches
                    </div>
                    <div className="text-muted mt-xs">
                      {overview.stats.teamCount} teams
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation tiles */}
          <div className="grid grid-2">
            <HubTile
              title="Draft"
              description={
                status === "Signup" || status === "Drafting"
                  ? "Enter the draft room, review picks, and manage your draft."
                  : "Draft is available before and during Drafting."
              }
              href={draftHref}
              disabled={status === "Archived"}
            />

            <HubTile
              title="Marketplace"
              description="Trades, waivers, shop purchases, and season transactions."
              href={marketplaceHref}
              disabled={status === "Archived"}
            />

            <HubTile
              title="Teams"
              description="View teams and rosters for this season."
              href={teamsHubHref}
              disabled={status === "Archived"}
              disabledReason={status === "Archived" ? "Season is archived." : undefined}
            />

            <HubTile
              title="Matches"
              description="Upcoming fixtures, results, and match detail pages."
              href={`/leagues/${leagueId}/seasons/${seasonId}/matches`}
              disabled={false}
            />
          </div>

          {/* Previews */}
          <div className="layout-two-column">
            <div className="stack">
              <div id="matches" className="card">
                <div className="card-header">
                  <div className="row row-sm" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div className="card-title">Matches</div>
                      <div className="card-subtitle">Upcoming & recent</div>
                    </div>
                    <span className="badge badge-outline">Preview</span>
                  </div>
                </div>

                <div className="card-body">
                  {overview.upcomingMatches.length === 0 && overview.recentResults.length === 0 ? (
                    <div className="text-muted">No matches yet.</div>
                  ) : (
                    <ul className="list list-divided">
                      {overview.upcomingMatches.slice(0, 3).map((m) => {
                        const a = teamNameById.get(m.teamAId) ?? `Team ${m.teamAId}`;
                        const b = teamNameById.get(m.teamBId) ?? `Team ${m.teamBId}`;
                        return (
                          <li key={`up-${m.matchId}`} className="list-item">
                            <div>
                              <div>
                                <strong>{a}</strong> vs <strong>{b}</strong>
                              </div>
                              <div className="text-muted mt-xs">
                                Round {m.round ?? "?"} • {formatDateTime(m.scheduledAt)}
                              </div>
                            </div>
                            <Link className="btn btn-ghost" href={`/matches/${m.matchId}`}>
                              Open
                            </Link>
                          </li>
                        );
                      })}

                      {overview.recentResults.slice(0, 3).map((m) => {
                        const a = teamNameById.get(m.teamAId) ?? `Team ${m.teamAId}`;
                        const b = teamNameById.get(m.teamBId) ?? `Team ${m.teamBId}`;
                        return (
                          <li key={`res-${m.matchId}`} className="list-item">
                            <div>
                              <div>
                                <strong>{a}</strong> vs <strong>{b}</strong>
                              </div>
                              <div className="text-muted mt-xs">
                                {m.scoreTeamA ?? "–"}:{m.scoreTeamB ?? "–"} • Completed {formatDateTime(m.completedAt)}
                              </div>
                            </div>
                            <Link className="btn btn-ghost" href={`/matches/${m.matchId}`}>
                              Open
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="stack">
              <div id="teams" className="card">
                <div className="card-header">
                  <div className="row row-sm" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div className="card-title">Teams</div>
                      <div className="card-subtitle">Season roster overview</div>
                    </div>
                    <span className="badge badge-outline">Preview</span>
                  </div>
                </div>

                <div className="card-body">
                  {teams?.teams?.length ? (
                    <ul className="list list-divided">
                      {teams.teams.slice(0, 5).map((t) => (
                        <li key={t.teamId} className="list-item">
                          <div>
                            <div>
                              <strong>{t.name}</strong>
                            </div>
                            <div className="text-muted mt-xs">
                              {t.managerDisplayName ?? "Manager"} • {t.record.wins}-{t.record.losses}-{t.record.draws}
                            </div>
                          </div>
                          <Link
                            className="btn btn-ghost"
                            href={`/teams/${t.teamId}?seasonId=${seasonId}`}
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-muted">No teams yet.</div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">Quick links</div>
                  <div className="card-subtitle">Season-scoped tools</div>
                </div>
                <div className="card-body">
                  <div className="stack stack-sm">
                    <Link className="btn btn-secondary" href={draftHref} id="draft">
                      Draft
                    </Link>
                    <Link className="btn btn-secondary" href={marketplaceHref}>
                      Marketplace
                    </Link>
                    <Link className="btn btn-secondary" href={teamsHubHref}>
                      Teams
                    </Link>
                    {yourTeamLink ? (
                      <Link className="btn btn-secondary" href={yourTeamLink}>
                        Your Team
                      </Link>
                    ) : null}
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
