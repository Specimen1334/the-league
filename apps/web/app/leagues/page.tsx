"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

// -----------------------------
// Types – aligned with leagues module
// -----------------------------

type LeagueVisibility = "public" | "private" | "hidden" | string;

type LeagueListItem = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  visibility: LeagueVisibility;

  ownerDisplayName?: string | null;
  memberCount?: number | null;
  createdAt?: string | null;

  // Optional hints from backend:
  isMember?: boolean;
  isOwner?: boolean;
  activeSeasonId?: number | null;
  activeSeasonName?: string | null;
};

type PaginatedLeaguesResponse = {
  items: LeagueListItem[];
  page: number;
  limit: number;
  total: number;
};

type MyLeaguesResponse = {
  items: LeagueListItem[];
};

type CreateLeagueBody = {
  name: string;
  description?: string | null;
  visibility: LeagueVisibility;
  password?: string | null;
};

type JoinLeagueBody = {
  password?: string | null;
};

type HttpErrorWithStatus = Error & { status?: number };

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
// Page
// -----------------------------

type SortOption = "recent" | "alpha";
type DiscoverVisibilityFilter = "all" | "public" | "private";

export default function LeagueExplorerPage() {
  // My leagues
  const [myLeagues, setMyLeagues] = useState<LeagueListItem[] | null>(null);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);

  // Discover
  const [discover, setDiscover] =
    useState<PaginatedLeaguesResponse | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] =
    useState<DiscoverVisibilityFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [page, setPage] = useState(1);
  const limit = 24;

  // Create league
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createVisibility, setCreateVisibility] =
    useState<LeagueVisibility>("public");
  const [createPassword, setCreatePassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join league
  const [joinPasswordById, setJoinPasswordById] = useState<Record<number, string>>(
    {}
  );
  const [joiningLeagueId, setJoiningLeagueId] = useState<number | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // -----------------------------
  // Load "My Leagues" once
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadMy() {
      setMyLoading(true);
      setMyError(null);

      try {
  const data = await fetchJson<MyLeaguesResponse>("/leagues/mine");
  if (cancelled) return;
  setMyLeagues(data.items);
} catch (err: any) {
        if (cancelled) return;
        const message =
          err?.message ??
          "Failed to load your leagues. You may need to log in.";
        setMyError(message);
      } finally {
        if (!cancelled) setMyLoading(false);
      }
    }

    loadMy();
    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------
  // Load discover list whenever filters change
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadDiscover() {
      setDiscoverLoading(true);
      setDiscoverError(null);
      setJoinError(null);

      try {
        const query = new URLSearchParams();
        query.set("page", String(page));
        query.set("limit", String(limit));
        if (search.trim()) {
          query.set("search", search.trim());
        }
        if (visibilityFilter === "public" || visibilityFilter === "private") {
          query.set("visibility", visibilityFilter);
        }

        const data = await fetchJson<PaginatedLeaguesResponse>(
          `/leagues?${query.toString()}`
        );
        if (cancelled) return;
        setDiscover(data);
      } catch (err: any) {
        if (cancelled) return;
        setDiscoverError(err?.message ?? "Failed to load leagues.");
      } finally {
        if (!cancelled) setDiscoverLoading(false);
      }
    }

    loadDiscover();
    return () => {
      cancelled = true;
    };
  }, [search, visibilityFilter, page]);

  const discoverItemsSorted: LeagueListItem[] = useMemo(() => {
    const items = discover?.items ?? [];
    if (items.length === 0) return items;

    if (sort === "alpha") {
      return [...items].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    }

    // "recent" – use createdAt if available, otherwise keep backend order
    if (sort === "recent") {
      const itemsWithCreated = items.filter((i) => !!i.createdAt);
      const itemsWithoutCreated = items.filter((i) => !i.createdAt);
      itemsWithCreated.sort((a, b) => {
        const da = new Date(a.createdAt as string).getTime();
        const db = new Date(b.createdAt as string).getTime();
        return db - da;
      });
      return [...itemsWithCreated, ...itemsWithoutCreated];
    }

    return items;
  }, [discover, sort]);

  const totalPages = useMemo(() => {
    if (!discover) return 1;
    return Math.max(1, Math.ceil(discover.total / discover.limit));
  }, [discover]);

  // -----------------------------
  // Create league
  // -----------------------------

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!createName.trim() || createLoading) return;

    setCreateLoading(true);
    setCreateError(null);

    const body: CreateLeagueBody = {
      name: createName.trim(),
      visibility: createVisibility,
      description: createDescription.trim() || null,
      password: createVisibility === "private"
        ? createPassword || null
        : null
    };

    try {
      const created = await fetchJson<LeagueListItem>("/leagues", {
        method: "POST",
        body: JSON.stringify(body)
      });

      // Add to My Leagues and Discover optimistically
      setMyLeagues((prev) => (prev ? [created, ...prev] : [created]));
      setDiscover((prev) =>
        prev
          ? {
              ...prev,
              items: [created, ...prev.items],
              total: prev.total + 1
            }
          : prev
      );

      setCreateName("");
      setCreateDescription("");
      setCreateVisibility("public");
      setCreatePassword("");
      setCreateOpen(false);
    } catch (err: any) {
      const message: string =
        err?.message ??
        "Failed to create league. Check your details and try again.";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  }

  // -----------------------------
  // Join league
  // -----------------------------

  async function handleJoin(league: LeagueListItem) {
    if (joiningLeagueId === league.id) return;

    setJoiningLeagueId(league.id);
    setJoinError(null);

    const password =
      league.visibility === "private"
        ? (joinPasswordById[league.id] ?? "").trim() || null
        : null;

    const body: JoinLeagueBody = { password };

    try {
      const res = await fetchJson<{ ok: boolean; league?: LeagueListItem }>(
        `/leagues/${league.id}/join`,
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );

      const updatedLeague = res.league ?? {
        ...league,
        isMember: true
      };

      // Update My Leagues and Discover
      setMyLeagues((prev) =>
        prev
          ? prev.some((l) => l.id === updatedLeague.id)
            ? prev.map((l) => (l.id === updatedLeague.id ? updatedLeague : l))
            : [updatedLeague, ...prev]
          : [updatedLeague]
      );
      setDiscover((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((l) =>
                l.id === updatedLeague.id ? updatedLeague : l
              )
            }
          : prev
      );
    } catch (err: any) {
      const message: string =
        err?.message ??
        "Failed to join league. Check password/eligibility and try again.";
      setJoinError(message);
    } finally {
      setJoiningLeagueId(null);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="leagues-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">League Explorer</h1>
          <p className="page-subtitle">
            Browse, join, and create leagues. This is your hub to enter League
            and Season Hubs.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreateOpen((open) => !open)}
          >
            {createOpen ? "Close create form" : "Create league"}
          </button>
        </div>
      </header>

      {/* Create league card */}
      {createOpen && (
        <section className="card create-league-card">
          <div className="card-header">
            <h2 className="card-title">Create a new league</h2>
            <p className="card-subtitle">
              Choose a name, visibility, and optional join password.
            </p>
          </div>
          <div className="card-body">
            {createError && <div className="form-error">{createError}</div>}

            <form className="stack stack-md" onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="league-name" className="field-label">
                  League name
                </label>
                <input
                  id="league-name"
                  className="input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  disabled={createLoading}
                />
              </div>

              <div className="field">
                <label htmlFor="league-description" className="field-label">
                  Description
                </label>
                <textarea
                  id="league-description"
                  className="input textarea"
                  rows={3}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  disabled={createLoading}
                />
                <p className="field-hint">
                  Tell players what this league is about, format, or house
                  rules.
                </p>
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="field-label">Visibility</label>
                  <select
                    className="input"
                    value={createVisibility}
                    onChange={(e) =>
                      setCreateVisibility(e.target.value as LeagueVisibility)
                    }
                    disabled={createLoading}
                  >
                    <option value="public">Public (searchable, open)</option>
                    <option value="private">
                      Private (requires password or invite)
                    </option>
                    <option value="hidden">
                      Hidden (not shown in discover – advanced)
                    </option>
                  </select>
                </div>

                {createVisibility === "private" && (
                  <div className="field">
                    <label htmlFor="league-password" className="field-label">
                      Join password
                    </label>
                    <input
                      id="league-password"
                      className="input"
                      type="text"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      disabled={createLoading}
                    />
                    <p className="field-hint">
                      Players must enter this password to join the league.
                    </p>
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createLoading || !createName.trim()}
                >
                  {createLoading ? "Creating…" : "Create league"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCreateOpen(false)}
                  disabled={createLoading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* My leagues */}
      <section className="stack stack-md leagues-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Your leagues</h2>
            <p className="section-subtitle">
              Leagues you&apos;re a member of, with quick entry into hubs.
            </p>
          </div>
        </div>

        {myError && <div className="form-error">{myError}</div>}

        <div className="card">
          <div className="card-body">
            {myLoading && !myLeagues && <div>Loading your leagues…</div>}
            {!myLoading && myLeagues && myLeagues.length === 0 && (
              <div className="empty-state">
                You&apos;re not in any leagues yet.
                <br />
                <span className="text-muted">
                  Join a public league below or create your own.
                </span>
              </div>
            )}

            {myLeagues && myLeagues.length > 0 && (
              <div className="grid grid-3 league-grid">
                {myLeagues.map((lg) => (
                  <LeagueCard
                    key={lg.id}
                    league={lg}
                    variant="mine"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Discover leagues */}
      <section className="stack stack-md leagues-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Discover leagues</h2>
            <p className="section-subtitle">
              Browse public and discoverable leagues. Use filters to find
              something that fits your style.
            </p>
          </div>
          <div className="section-controls">
            <div className="field-row">
              <div className="field">
                <label className="field-label sr-only">Search</label>
                <input
                  className="input input-sm"
                  placeholder="Search by name or owner…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="field">
                <label className="field-label sr-only">Visibility</label>
                <select
                  className="input input-sm"
                  value={visibilityFilter}
                  onChange={(e) => {
                    setVisibilityFilter(
                      e.target.value as DiscoverVisibilityFilter
                    );
                    setPage(1);
                  }}
                >
                  <option value="all">All visibilities</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label sr-only">Sort</label>
                <select
                  className="input input-sm"
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as SortOption)
                  }
                >
                  <option value="recent">Most recently active</option>
                  <option value="alpha">Alphabetical</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {discoverError && <div className="form-error">{discoverError}</div>}
        {joinError && <div className="form-error">{joinError}</div>}

        <div className="card">
          <div className="card-body">
            {discoverLoading && !discover && <div>Loading leagues…</div>}
            {!discoverLoading &&
              discover &&
              discover.items.length === 0 && (
                <div className="empty-state">
                  No leagues found for this filter.
                </div>
              )}

            {discover && discoverItemsSorted.length > 0 && (
              <div className="grid grid-3 league-grid">
                {discoverItemsSorted.map((lg) => {
                  const joinPassword =
                    joinPasswordById[lg.id] ?? "";
                  return (
                    <LeagueCard
                      key={lg.id}
                      league={lg}
                      variant="discover"
                      joinPassword={joinPassword}
                      onChangeJoinPassword={(value) =>
                        setJoinPasswordById((prev) => ({
                          ...prev,
                          [lg.id]: value
                        }))
                      }
                      joining={joiningLeagueId === lg.id}
                      onJoin={() => handleJoin(lg)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {discover && discover.total > discover.limit && (
            <div className="card-footer leagues-pagination">
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// -----------------------------
// League card component
// -----------------------------

function LeagueCard(props: {
  league: LeagueListItem;
  variant: "mine" | "discover";
  joinPassword?: string;
  joining?: boolean;
  onChangeJoinPassword?: (value: string) => void;
  onJoin?: () => void;
}) {
  const {
    league,
    variant,
    joinPassword,
    joining,
    onChangeJoinPassword,
    onJoin
  } = props;

  const isMember = league.isMember ?? variant === "mine";
  const isPrivate = league.visibility === "private";
  const isHidden = league.visibility === "hidden";

  const visibilityLabel =
    league.visibility === "public"
      ? "Public"
      : league.visibility === "private"
      ? "Private"
      : "Hidden";

  const memberCountLabel =
    typeof league.memberCount === "number"
      ? `${league.memberCount} member${
          league.memberCount === 1 ? "" : "s"
        }`
      : "Members";

  return (
    <article className="card league-card">
      <div className="card-body league-card-body">
        <div className="league-card-header">
          <div className="league-logo-placeholder">
            {league.logoUrl ? (
              // if you later add <Image>, swap this out
              <span className="league-logo-text">
                {league.name.slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <span className="league-logo-text">
                {league.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="league-card-title-block">
            <h3 className="league-card-title">{league.name}</h3>
            <div className="league-card-meta-row">
              <span className="pill pill-outline pill-xs">
                {visibilityLabel}
              </span>
              {league.ownerDisplayName && (
                <span className="text-muted text-xs">
                  Owner: {league.ownerDisplayName}
                </span>
              )}
            </div>
          </div>
        </div>

        {league.description && (
          <p className="league-card-description text-muted">
            {league.description}
          </p>
        )}

        <div className="league-card-foot">
          <div className="league-card-foot-left">
            <span className="text-muted text-xs">
              {memberCountLabel}
            </span>
            {league.activeSeasonId && (
              <span className="badge badge-soft ml-xs text-xs">
                Active season:{" "}
                {league.activeSeasonName ?? `#${league.activeSeasonId}`}
              </span>
            )}
          </div>
          <div className="league-card-foot-right">
            <Link
              href={`/leagues/${league.id}`}
              className="btn btn-xs btn-secondary"
            >
              League hub
            </Link>
            {league.activeSeasonId && (
              <Link
                href={`/leagues/${league.id}/seasons/${league.activeSeasonId}`}
                className="btn btn-xs btn-ghost"
              >
                Season hub
              </Link>
            )}
          </div>
        </div>

        {/* Actions for discover view */}
        {variant === "discover" && !isHidden && (
          <div className="league-card-actions">
            {isMember ? (
              <span className="badge badge-success">
                You&apos;re in this league
              </span>
            ) : (
              <>
                {isPrivate && (
                  <div className="field field--compact">
                    <label className="field-label text-xs">
                      Join password
                    </label>
                    <input
                      className="input input-xs"
                      type="text"
                      value={joinPassword ?? ""}
                      onChange={(e) =>
                        onChangeJoinPassword &&
                        onChangeJoinPassword(e.target.value)
                      }
                      disabled={joining}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={onJoin}
                  disabled={joining}
                >
                  {joining ? "Joining…" : "Join league"}
                </button>
              </>
            )}
          </div>
        )}

        {/* For "My leagues" we can show a subtle role hint if backend sends it later */}
      </div>
    </article>
  );
}
