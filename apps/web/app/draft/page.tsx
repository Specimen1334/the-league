"use client";

import React from "react";
import Link from "next/link";

import { apiFetchJson } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type LeagueMineItem = {
  id: number;
  name: string;
  logoUrl: string | null;
};

type LeagueSeasonSummary = {
  id: number;
  name: string;
  status: "Signup" | "Drafting" | "Active" | "Playoffs" | "Completed" | "Archived";
  formatType: string;
  startsAt: string | null;
  endsAt: string | null;
};

type LeagueSeasonsResponse = { items: LeagueSeasonSummary[] };
type MyLeaguesResponse = { items: LeagueMineItem[] };

function badge(status: LeagueSeasonSummary["status"]) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
  switch (status) {
    case "Drafting":
      return <span className={`${base} bg-emerald-400/20 text-emerald-200 border border-emerald-300/30`}>Drafting</span>;
    case "Signup":
      return <span className={`${base} bg-white/10 text-white/80 border border-white/10`}>Signup</span>;
    case "Active":
      return <span className={`${base} bg-sky-400/20 text-sky-200 border border-sky-300/30`}>Active</span>;
    case "Playoffs":
      return <span className={`${base} bg-fuchsia-400/20 text-fuchsia-200 border border-fuchsia-300/30`}>Playoffs</span>;
    case "Completed":
      return <span className={`${base} bg-white/10 text-white/80 border border-white/10`}>Completed</span>;
    case "Archived":
      return <span className={`${base} bg-white/10 text-white/60 border border-white/10`}>Archived</span>;
    default:
      return <span className={`${base} bg-white/10 text-white/80 border border-white/10`}>{status}</span>;
  }
}

export default function DraftBrowserPage() {
  const { user, isLoading } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<
    { leagueId: number; leagueName: string; season: LeagueSeasonSummary }[]
  >([]);

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) return;

    let alive = true;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const leagues = await apiFetchJson<MyLeaguesResponse>("/leagues/mine");
        const rows: { leagueId: number; leagueName: string; season: LeagueSeasonSummary }[] = [];
        for (const lg of leagues.items ?? []) {
          const seasons = await apiFetchJson<LeagueSeasonsResponse>(`/leagues/${lg.id}/seasons`);
          for (const s of seasons.items ?? []) {
            rows.push({ leagueId: lg.id, leagueName: lg.name, season: s });
          }
        }
        // Most relevant first: Drafting, then Signup, then Active, then rest. Newest id first inside bucket.
        const rank: Record<string, number> = {
          Drafting: 0,
          Signup: 1,
          Active: 2,
          Playoffs: 3,
          Completed: 4,
          Archived: 5,
        };
        rows.sort((a, b) => {
          const ra = rank[a.season.status] ?? 99;
          const rb = rank[b.season.status] ?? 99;
          if (ra !== rb) return ra - rb;
          return b.season.id - a.season.id;
        });

        if (!alive) return;
        setItems(rows);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load draft seasons");
      } finally {
        if (alive) setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isLoading, user]);

  return (
    <main className="max-w-[1100px] mx-auto p-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Draft</h1>
          <p className="text-sm opacity-80 mt-1">Pick a season to enter the draft room.</p>
        </div>
        <button
          className="px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110 disabled:opacity-60"
          onClick={() => location.reload()}
          disabled={busy}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!user && !isLoading ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm opacity-80">You need to sign in to view your drafts.</p>
          <Link href="/login" className="inline-block mt-3 px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110">
            Sign in
          </Link>
        </div>
      ) : null}

      {busy ? (
        <div className="mt-6 text-sm opacity-80">Loading…</div>
      ) : null}

      {!busy && user ? (
        <div className="mt-6 grid gap-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm opacity-80">
              No seasons found in your leagues.
            </div>
          ) : null}

          {items.map(({ leagueId, leagueName, season }) => (
            <div
              key={season.id}
              className="rounded-2xl border border-white/10 bg-surface-2/60 backdrop-blur p-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold truncate">{season.name}</h2>
                  {badge(season.status)}
                </div>
                <div className="text-xs opacity-70 mt-1 truncate">
                  {leagueName} <span className="opacity-50">•</span> Season #{season.id}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/seasons/${season.id}`}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm"
                >
                  Season hub
                </Link>
                <Link
                  href={`/draft/${season.id}/room`}
                  className="px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110 text-sm"
                >
                  Open room
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
