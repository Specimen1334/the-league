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

type SeasonResponse = {
  season: {
    id: number;
    leagueId: number | null;
    name: string;
    status: SeasonStatus;
  };
};

type SeasonTeamsResponse = {
  seasonId: number;
  teams: Array<{
    teamId: number;
    name: string;
    logoUrl: string | null;
    managerUserId: number;
    managerDisplayName: string | null;
    record: { wins: number; losses: number; draws: number };
  }>;
};

function safeLower(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}


export default function SeasonTeamsHubPage() {
  const params = useParams<{ leagueId: string; seasonId: string }>();
  const leagueId = Number(params?.leagueId);
  const seasonId = Number(params?.seasonId);

  const [season, setSeason] = useState<SeasonResponse["season"] | null>(null);
  const [teams, setTeams] = useState<SeasonTeamsResponse["teams"]>([]);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([
        apiFetchJson<SeasonResponse>(`/seasons/${seasonId}`),
        apiFetchJson<SeasonTeamsResponse>(`/seasons/${seasonId}/teams`)
      ]);
      setSeason(s.season);
      setTeams(t.teams ?? []);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to load season teams";
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => {
      return (
        safeLower(t.name).includes(q) ||
        safeLower(t.managerDisplayName).includes(q)
      );
    });
  }, [teams, query]);

  return (
    <PageShell>
      <PageHeader
        title="Teams"
        subtitle={season ? `${season.name} • ${season.status}` : `Season #${seasonId}`}
        breadcrumb={
          <Link className="link" href={`/leagues/${leagueId}/seasons/${seasonId}`}>
            ← Back to Season
          </Link>
        }
        actions={
          <div className="row row-sm">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams…"
              aria-label="Search teams"
            />
          </div>
        }
      />

      {loading ? (
        <div className="card">
          <div className="card-body">Loading teams…</div>
        </div>
      ) : error ? (
        <EmptyState
          title="Teams failed to load"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={load}>
              Retry
            </button>
          }
        />
      ) : teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          description="Teams will appear here once managers are registered or league staff creates them."
        />
      ) : filteredTeams.length === 0 ? (
        <EmptyState
          title="No teams found"
          description="Try a different search."
          action={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          }
        />
      ) : (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Season teams</div>
              <div className="card-subtitle">
                {filteredTeams.length} of {teams.length}
              </div>
            </div>
          </div>

          <div className="card-body">
            <ul className="list list-divided">
              {filteredTeams.map((t) => (
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
          </div>
        </div>
      )}
    </PageShell>
  );
}
