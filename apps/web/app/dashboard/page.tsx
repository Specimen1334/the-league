"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

// -----------------------------
// Types – mirror /dashboard response
// -----------------------------

type DashboardLeague = {
  leagueId: number;
  leagueName: string;
  leagueLogoUrl?: string | null;

  currentSeasonId?: number | null;
  currentSeasonName?: string | null;
  currentSeasonStatus?: string | null;

  teamId?: number | null;
  teamName?: string | null;
  role: "player" | "commissioner" | "superadmin" | "spectator" | string;
};

type DashboardDraft = {
  seasonId: number;
  leagueId: number;
  leagueName: string;
  seasonName: string;
  status: string; // e.g. "Signup", "Drafting"
  startsAt: string | null; // ISO
};

type DashboardMatch = {
  matchId: number;
  leagueId: number;
  seasonId: number;
  leagueName: string;
  seasonName: string;
  round: number | null;
  scheduledAt: string | null;
  status: string;
  yourTeamName?: string | null;
  opponentTeamName?: string | null;
};

type DashboardNotification = {
  id: number;
  type: string; // e.g. "match", "draft", "system"
  title: string;
  message: string;
  createdAt: string; // ISO
  isRead?: boolean;
  href?: string | null;
};

type DashboardResponse = {
  leagues: DashboardLeague[];
  upcomingDrafts: DashboardDraft[];
  upcomingMatches: DashboardMatch[];
  notifications: DashboardNotification[];
};

// For error handling with status
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchDashboard(): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE_URL}/dashboard`, {
    credentials: "include"
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const message =
      data?.error || data?.message || `Request failed with status ${res.status}`;
    throw new HttpError(res.status, message);
  }

  return data as DashboardResponse;
}

// -----------------------------
// Helpers
// -----------------------------

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return d.toLocaleDateString();
}

// -----------------------------
// Page
// -----------------------------

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dashboard = await fetchDashboard();
        if (!cancelled) setData(dashboard);
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 401) {
          setError("You need to be logged in to view the dashboard.");
        } else {
          setError(err?.message ?? "Failed to load dashboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const leagues = data?.leagues ?? [];
  const drafts = data?.upcomingDrafts ?? [];
  const matches = data?.upcomingMatches ?? [];
  const notifications = data?.notifications ?? [];

  return (
    <main className="dashboard-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Your dashboard</h1>
          <p className="page-subtitle">
            Quick overview of your leagues, drafts, matches, and notifications.
          </p>
        </div>
      </header>

      {error && (
        <div className="form-error">
          {error}
          {error.includes("logged in") && (
            <div className="stack stack-xs">
              <Link href="/login" className="btn btn-sm btn-primary">
                Go to login
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="layout-two-column dashboard-layout">
        {/* Left column: leagues + matches */}
        <div className="stack stack-lg">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Your leagues</h2>
              <p className="card-subtitle">
                Current leagues you&apos;re in, with quick links into hubs.
              </p>
            </div>
            <div className="card-body">
              {loading && !data && <div>Loading leagues…</div>}
              {!loading && leagues.length === 0 && (
                <div className="empty-state">
                  You&apos;re not in any leagues yet.
                  <br />
                  <Link href="/leagues" className="btn btn-sm btn-primary mt-sm">
                    Browse leagues
                  </Link>
                </div>
              )}

              {leagues.length > 0 && (
                <ul className="list list-divided">
                  {leagues.map((lg) => (
                    <li key={lg.leagueId} className="list-item list-item--dense">
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          <div className="pill pill-soft">
                            {lg.leagueName}
                          </div>
                          <span className="pill pill-outline pill-xs">
                            {lg.role === "commissioner"
                              ? "Commissioner"
                              : lg.role === "superadmin"
                              ? "Superadmin"
                              : "Player"}
                          </span>
                        </div>

                        <div className="list-item-meta-row">
                          {lg.currentSeasonId ? (
                            <span className="text-muted">
                              Season: {lg.currentSeasonName ?? "Current"} ·{" "}
                              {lg.currentSeasonStatus ?? "Unknown status"}
                            </span>
                          ) : (
                            <span className="text-muted">
                              No active season yet.
                            </span>
                          )}
                          {lg.teamId && (
                            <span className="badge badge-soft ml-sm">
                              Your team: {lg.teamName ?? `Team #${lg.teamId}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="list-item-actions">
                        <Link
                          href={`/leagues/${lg.leagueId}`}
                          className="btn btn-xs btn-secondary"
                        >
                          League
                        </Link>
                        {lg.currentSeasonId && (
                          <Link
                            href={`/leagues/${lg.leagueId}/seasons/${lg.currentSeasonId}`}
                            className="btn btn-xs btn-ghost"
                          >
                            Season
                          </Link>
                        )}
                        {lg.teamId && (
                          <Link
                            href={`/teams/${lg.teamId}`}
                            className="btn btn-xs btn-ghost"
                          >
                            Team
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Upcoming matches</h2>
              <p className="card-subtitle">
                Matches in your leagues that are scheduled or in progress.
              </p>
            </div>
            <div className="card-body">
              {loading && !data && <div>Loading matches…</div>}
              {!loading && matches.length === 0 && (
                <div className="empty-state">
                  No upcoming matches right now.
                </div>
              )}

              {matches.length > 0 && (
                <ul className="list list-divided">
                  {matches.map((m) => (
                    <li key={m.matchId} className="list-item list-item--dense">
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          <div className="pill pill-soft">
                            {m.yourTeamName ?? "Your team"} vs{" "}
                            {m.opponentTeamName ?? "Opponent"}
                          </div>
                          <span className="pill pill-outline pill-xs">
                            {m.leagueName} · {m.seasonName}
                          </span>
                        </div>
                        <div className="list-item-meta-row">
                          <span className="text-muted">
                            {m.round != null ? `Round ${m.round} · ` : ""}
                            {formatDateTime(m.scheduledAt)}
                          </span>
                          <span className="badge badge-soft ml-sm">
                            {m.status}
                          </span>
                        </div>
                      </div>
                      <div className="list-item-actions">
                        <Link
                          href={`/matches/${m.matchId}`}
                          className="btn btn-xs btn-secondary"
                        >
                          Open match
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Right column: drafts + notifications */}
        <div className="stack stack-lg">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Upcoming drafts</h2>
              <p className="card-subtitle">
                Draft lobbies and scheduled draft times for your seasons.
              </p>
            </div>
            <div className="card-body">
              {loading && !data && <div>Loading drafts…</div>}
              {!loading && drafts.length === 0 && (
                <div className="empty-state">
                  No drafts scheduled right now.
                </div>
              )}

              {drafts.length > 0 && (
                <ul className="list list-divided">
                  {drafts.map((d) => (
                    <li key={d.seasonId} className="list-item list-item--dense">
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          <div className="pill pill-soft">
                            {d.leagueName}
                          </div>
                          <span className="pill pill-outline pill-xs">
                            {d.seasonName}
                          </span>
                        </div>
                        <div className="list-item-meta-row">
                          <span className="text-muted">
                            {formatDateTime(d.startsAt)}
                          </span>
                          <span className="badge badge-soft ml-sm">
                            {d.status}
                          </span>
                        </div>
                      </div>
                      <div className="list-item-actions">
                        <Link
                          href={`/draft/${d.seasonId}`}
                          className="btn btn-xs btn-secondary"
                        >
                          Draft lobby
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Notifications</h2>
              <p className="card-subtitle">
                Match results, draft updates, invites, and system messages.
              </p>
            </div>
            <div className="card-body">
              {loading && !data && <div>Loading notifications…</div>}
              {!loading && notifications.length === 0 && (
                <div className="empty-state">
                  You&apos;re all caught up.
                </div>
              )}

              {notifications.length > 0 && (
                <ul className="list list-divided">
                  {notifications.map((n) => (
                    <li key={n.id} className="list-item list-item--dense">
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          <div className="pill pill-soft">
                            {n.title || n.type}
                          </div>
                          <span className="pill pill-outline pill-xs">
                            {formatShortDate(n.createdAt)}
                          </span>
                        </div>
                        <div className="list-item-meta-row">
                          <span className="text-muted">{n.message}</span>
                          {!n.isRead && (
                            <span className="badge badge-accent ml-sm">
                              New
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="list-item-actions">
                        {n.href ? (
                          <Link
                            href={n.href}
                            className="btn btn-xs btn-ghost"
                          >
                            View
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-md">
                <Link href="/inbox" className="btn btn-sm btn-ghost">
                  Open inbox
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
