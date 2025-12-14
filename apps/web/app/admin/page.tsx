"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

// -----------------------------
// Shared types (mirror backend)
// -----------------------------

type PaginatedResult<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

type AdminUserOverview = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: "user" | "commissioner" | "superadmin" | string;
  createdAt: string;
  isBanned: boolean;
};

type AdminLeagueOverview = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  visibility: "public" | "private" | "hidden" | string;
  ownerUserId: number | null;
  createdAt: string;
};

type AdminSeasonOverview = {
  id: number;
  leagueId: number;
  name: string;
  description: string | null;
  status: string;
  formatType: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

type AdminTeamOverview = {
  id: number;
  leagueId: number | null;
  seasonId: number | null;
  name: string;
  logoUrl: string | null;
  managerUserId: number;
  createdAt: string;
};

type AdminMatchOverview = {
  id: number;
  leagueId: number | null;
  seasonId: number;
  round: number | null;
  teamAId: number;
  teamBId: number;
  status: string;
  scheduledAt: string | null;
  winnerTeamId: number | null;
  scoreTeamA: number | null;
  scoreTeamB: number | null;
  createdAt: string;
};

type AdminFeatureFlagRow = {
  id: number;
  key: string;
  enabled: boolean;
  scope: "global" | "league" | "season";
  leagueId: number | null;
  seasonId: number | null;
};

// Bodies for PATCH calls
type AdminUpdateUserBody = {
  username?: string;
  displayName?: string | null;
  email?: string | null;
  role?: "user" | "commissioner" | "superadmin";
  isBanned?: boolean;
};

type AdminUpdateLeagueBody = {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  visibility?: "public" | "private" | "hidden";
  ownerUserId?: number;
};

type AdminUpdateFeatureFlagBody = {
  key: string;
  enabled: boolean;
  scope?: "global" | "league" | "season";
  leagueId?: number;
  seasonId?: number;
};

// -----------------------------
// Fetch helpers
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

  if (!res.ok) {
    let detail: any = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const message =
      detail?.error ||
      detail?.message ||
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return (await res.json()) as T;
}

// -----------------------------
// Root component
// -----------------------------

type AdminTab = "overview" | "users" | "leagues" | "flags";

export default function AdminControlRoomPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1 className="page-title">Admin / System Control Room</h1>
          <p className="page-subtitle">
            Superadmin overview of users, leagues, seasons, teams, matches and
            feature flags.
          </p>
        </div>
      </header>

      <div className="tabs tabs--underline admin-tabs">
        <button
          type="button"
          className={
            "tabs-item" +
            (activeTab === "overview" ? " tabs-item--active" : "")
          }
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={
            "tabs-item" + (activeTab === "users" ? " tabs-item--active" : "")
          }
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          type="button"
          className={
            "tabs-item" + (activeTab === "leagues" ? " tabs-item--active" : "")
          }
          onClick={() => setActiveTab("leagues")}
        >
          Leagues
        </button>
        <button
          type="button"
          className={
            "tabs-item" + (activeTab === "flags" ? " tabs-item--active" : "")
          }
          onClick={() => setActiveTab("flags")}
        >
          Feature flags
        </button>
      </div>

      <section className="admin-content">
        {activeTab === "overview" && <AdminOverviewTab onJumpTab={setActiveTab} />}
        {activeTab === "users" && <AdminUsersTab />}
        {activeTab === "leagues" && <AdminLeaguesTab />}
        {activeTab === "flags" && <AdminFeatureFlagsTab />}
      </section>
    </main>
  );
}

// -----------------------------
// Overview tab
// -----------------------------

type OverviewCounts = {
  users: number;
  leagues: number;
  seasons: number;
  teams: number;
  matches: number;
  featureFlags: number;
};

function AdminOverviewTab(props: { onJumpTab: (tab: AdminTab) => void }) {
  const { onJumpTab } = props;
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [
          users,
          leagues,
          seasons,
          teams,
          matches,
          flags
        ] = await Promise.all([
          fetchJson<PaginatedResult<AdminUserOverview>>(
            "/admin/users?page=1&limit=1"
          ),
          fetchJson<PaginatedResult<AdminLeagueOverview>>(
            "/admin/leagues?page=1&limit=1"
          ),
          fetchJson<PaginatedResult<AdminSeasonOverview>>(
            "/admin/seasons?page=1&limit=1"
          ),
          fetchJson<PaginatedResult<AdminTeamOverview>>(
            "/admin/teams?page=1&limit=1"
          ),
          fetchJson<PaginatedResult<AdminMatchOverview>>(
            "/admin/matches?page=1&limit=1"
          ),
          fetchJson<AdminFeatureFlagRow[]>("/admin/config/features")
        ]);

        if (cancelled) return;

        setCounts({
          users: users.total,
          leagues: leagues.total,
          seasons: seasons.total,
          teams: teams.total,
          matches: matches.total,
          featureFlags: flags.length
        });
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load admin overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stack stack-lg">
      {error && <div className="form-error">{error}</div>}

      <div className="grid grid-4 admin-metrics">
        <OverviewMetric
          label="Users"
          value={counts?.users}
          loading={loading}
          onClick={() => onJumpTab("users")}
        />
        <OverviewMetric
          label="Leagues"
          value={counts?.leagues}
          loading={loading}
          onClick={() => onJumpTab("leagues")}
        />
        <OverviewMetric
          label="Seasons"
          value={counts?.seasons}
          loading={loading}
        />
        <OverviewMetric
          label="Teams"
          value={counts?.teams}
          loading={loading}
        />
        <OverviewMetric
          label="Matches"
          value={counts?.matches}
          loading={loading}
        />
        <OverviewMetric
          label="Feature flags"
          value={counts?.featureFlags}
          loading={loading}
          onClick={() => onJumpTab("flags")}
        />
      </div>

      <div className="card admin-quick-actions">
        <div className="card-header card-header--subtle">
          <h2 className="card-title">Quick admin actions</h2>
          <p className="card-subtitle">
            Jump into common system-management tasks.
          </p>
        </div>
        <div className="card-body">
          <div className="grid grid-3">
            <button
              type="button"
              className="btn btn-ghost card-quick-link"
              onClick={() => onJumpTab("users")}
            >
              Manage users
            </button>
            <button
              type="button"
              className="btn btn-ghost card-quick-link"
              onClick={() => onJumpTab("leagues")}
            >
              Manage leagues & seasons
            </button>
            <button
              type="button"
              className="btn btn-ghost card-quick-link"
              onClick={() => onJumpTab("flags")}
            >
              Configure feature flags
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewMetric(props: {
  label: string;
  value?: number | null;
  loading: boolean;
  onClick?: () => void;
}) {
  const { label, value, loading, onClick } = props;
  const clickable = !!onClick;

  const content = (
    <div className="card metric-card">
      <div className="card-body">
        <div className="metric-label">{label}</div>
        <div className="metric-value">
          {loading ? (
            <span className="skeleton skeleton-text" />
          ) : (
            value ?? 0
          )}
        </div>
      </div>
    </div>
  );

  if (!clickable) return content;

  return (
    <button
      type="button"
      className="metric-card-button"
      onClick={onClick}
      aria-label={`Open ${label} admin section`}
    >
      {content}
    </button>
  );
}

// -----------------------------
// Users tab
// -----------------------------

function AdminUsersTab() {
  const [data, setData] = useState<PaginatedResult<AdminUserOverview> | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const page = 1;
  const limit = 25;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        query.set("page", String(page));
        query.set("limit", String(limit));
        if (search.trim()) {
          query.set("search", search.trim());
        }

        const res = await fetchJson<PaginatedResult<AdminUserOverview>>(
          `/admin/users?${query.toString()}`
        );
        if (!cancelled) setData(res);
      } catch (err: any) {
        if (!cancelled)
          setError(err?.message ?? "Failed to load users for admin.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [search]);

  async function handleSave(user: AdminUserOverview, patch: AdminUpdateUserBody) {
    setSavingId(user.id);
    setError(null);
    try {
      const res = await fetchJson<AdminUserOverview>(
        `/admin/users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch)
        }
      );

      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((u) => (u.id === user.id ? res : u))
            }
          : prev
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to update user.");
    } finally {
      setSavingId(null);
    }
  }

  function handleInlineChange(
    userId: number,
    field: keyof AdminUserOverview,
    value: any
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((u) =>
              u.id === userId ? { ...u, [field]: value } : u
            )
          }
        : prev
    );
  }

  return (
    <div className="stack stack-md">
      <div className="admin-section-header">
        <div>
          <h2 className="section-title">Users</h2>
          <p className="section-subtitle">
            Search, edit roles, and toggle account status.
          </p>
        </div>
        <form
          className="inline-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
          }}
        >
          <input
            className="input input-sm"
            placeholder="Search username or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card">
        <div className="card-body">
          {loading && !data && <div>Loading users…</div>}
          {data && data.items.length === 0 && !loading && (
            <div className="empty-state">No users found.</div>
          )}

          {data && data.items.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Display name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td className="text-muted">#{u.id}</td>
                      <td>{u.username}</td>
                      <td>
                        <input
                          className="input input-xs"
                          value={u.displayName ?? ""}
                          onChange={(e) =>
                            handleInlineChange(
                              u.id,
                              "displayName",
                              e.target.value || null
                            )
                          }
                          disabled={savingId === u.id}
                        />
                      </td>
                      <td>
                        <input
                          className="input input-xs"
                          value={u.email ?? ""}
                          onChange={(e) =>
                            handleInlineChange(
                              u.id,
                              "email",
                              e.target.value || null
                            )
                          }
                          disabled={savingId === u.id}
                        />
                      </td>
                      <td>
                        <select
                          className="input input-xs"
                          value={u.role}
                          onChange={(e) =>
                            handleInlineChange(
                              u.id,
                              "role",
                              e.target.value as AdminUserOverview["role"]
                            )
                          }
                          disabled={savingId === u.id}
                        >
                          <option value="user">User</option>
                          <option value="commissioner">Commissioner</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </td>
                      <td>
                        <label className="badge-toggle">
                          <input
                            type="checkbox"
                            checked={!u.isBanned}
                            onChange={(e) =>
                              handleInlineChange(
                                u.id,
                                "isBanned",
                                !e.target.checked
                              )
                            }
                            disabled={savingId === u.id}
                          />
                          <span
                            className={
                              "badge " +
                              (u.isBanned
                                ? "badge-danger"
                                : "badge-success")
                            }
                          >
                            {u.isBanned ? "Banned" : "Active"}
                          </span>
                        </label>
                      </td>
                      <td className="text-muted">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          disabled={savingId === u.id}
                          onClick={() =>
                            handleSave(u, {
                              displayName: u.displayName ?? null,
                              email: u.email ?? null,
                              role: u.role as
                                | "user"
                                | "commissioner"
                                | "superadmin",
                              isBanned: u.isBanned
                            })
                          }
                        >
                          {savingId === u.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-meta text-muted">
                Showing {data.items.length} of {data.total} users (page{" "}
                {data.page})
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Leagues tab
// -----------------------------

function AdminLeaguesTab() {
  const [data, setData] =
    useState<PaginatedResult<AdminLeagueOverview> | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const page = 1;
  const limit = 25;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        query.set("page", String(page));
        query.set("limit", String(limit));
        if (search.trim()) {
          query.set("search", search.trim());
        }

        const res = await fetchJson<PaginatedResult<AdminLeagueOverview>>(
          `/admin/leagues?${query.toString()}`
        );
        if (!cancelled) setData(res);
      } catch (err: any) {
        if (!cancelled)
          setError(err?.message ?? "Failed to load leagues for admin.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [search]);

  async function handleSave(
    league: AdminLeagueOverview,
    patch: AdminUpdateLeagueBody
  ) {
    setSavingId(league.id);
    setError(null);
    try {
      const res = await fetchJson<AdminLeagueOverview>(
        `/admin/leagues/${league.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch)
        }
      );

      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((l) => (l.id === league.id ? res : l))
            }
          : prev
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to update league.");
    } finally {
      setSavingId(null);
    }
  }

  function handleInlineChange(
    leagueId: number,
    field: keyof AdminLeagueOverview,
    value: any
  ) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((l) =>
              l.id === leagueId ? { ...l, [field]: value } : l
            )
          }
        : prev
    );
  }

  return (
    <div className="stack stack-md">
      <div className="admin-section-header">
        <div>
          <h2 className="section-title">Leagues</h2>
          <p className="section-subtitle">
            Browse and edit leagues, owners, and visibility.
          </p>
        </div>
        <form
          className="inline-form"
          onSubmit={(e: FormEvent) => e.preventDefault()}
        >
          <input
            className="input input-sm"
            placeholder="Search league name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card">
        <div className="card-body">
          {loading && !data && <div>Loading leagues…</div>}
          {data && data.items.length === 0 && !loading && (
            <div className="empty-state">No leagues found.</div>
          )}

          {data && data.items.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Owner user ID</th>
                    <th>Visibility</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l.id}>
                      <td className="text-muted">#{l.id}</td>
                      <td>
                        <input
                          className="input input-xs"
                          value={l.name}
                          onChange={(e) =>
                            handleInlineChange(l.id, "name", e.target.value)
                          }
                          disabled={savingId === l.id}
                        />
                      </td>
                      <td>
                        <input
                          className="input input-xs"
                          type="number"
                          value={l.ownerUserId ?? ""}
                          onChange={(e) =>
                            handleInlineChange(
                              l.id,
                              "ownerUserId",
                              e.target.value
                                ? Number(e.target.value)
                                : null
                            )
                          }
                          disabled={savingId === l.id}
                        />
                      </td>
                      <td>
                        <select
                          className="input input-xs"
                          value={l.visibility}
                          onChange={(e) =>
                            handleInlineChange(
                              l.id,
                              "visibility",
                              e.target.value as AdminLeagueOverview["visibility"]
                            )
                          }
                          disabled={savingId === l.id}
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                          <option value="hidden">Hidden</option>
                        </select>
                      </td>
                      <td className="text-muted">
                        {new Date(l.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          disabled={savingId === l.id}
                          onClick={() =>
                            handleSave(l, {
                              name: l.name,
                              visibility: l.visibility as
                                | "public"
                                | "private"
                                | "hidden",
                              ownerUserId:
                                l.ownerUserId !== null
                                  ? Number(l.ownerUserId)
                                  : undefined
                            })
                          }
                        >
                          {savingId === l.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-meta text-muted">
                Showing {data.items.length} of {data.total} leagues (page{" "}
                {data.page})
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Feature flags tab
// -----------------------------

function AdminFeatureFlagsTab() {
  const [flags, setFlags] = useState<AdminFeatureFlagRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchJson<AdminFeatureFlagRow[]>(
          "/admin/config/features"
        );
        if (!cancelled) setFlags(res);
      } catch (err: any) {
        if (!cancelled)
          setError(err?.message ?? "Failed to load feature flags.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLocalChange(
    key: string,
    field: keyof AdminFeatureFlagRow,
    value: any
  ) {
    setFlags((prev) =>
      prev
        ? prev.map((f) => (f.key === key ? { ...f, [field]: value } : f))
        : prev
    );
  }

  async function handleSave(flag: AdminFeatureFlagRow) {
    setSavingKey(flag.key);
    setError(null);
    try {
      const body: AdminUpdateFeatureFlagBody = {
        key: flag.key,
        enabled: flag.enabled,
        scope: flag.scope,
        leagueId: flag.leagueId ?? undefined,
        seasonId: flag.seasonId ?? undefined
      };

      const res = await fetchJson<AdminFeatureFlagRow>(
        "/admin/config/features",
        {
          method: "PATCH",
          body: JSON.stringify(body)
        }
      );

      setFlags((prev) =>
        prev
          ? prev.map((f) => (f.key === res.key ? res : f))
          : prev
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to update feature flag.");
    } finally {
      setSavingKey(null);
    }
  }

  const sortedFlags = useMemo(() => {
    if (!flags) return [];
    return [...flags].sort((a, b) => a.key.localeCompare(b.key));
  }, [flags]);

  return (
    <div className="stack stack-md">
      <div className="admin-section-header">
        <div>
          <h2 className="section-title">Feature flags</h2>
          <p className="section-subtitle">
            Toggle features on/off globally or per-league/season.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card">
        <div className="card-body">
          {loading && !flags && <div>Loading flags…</div>}
          {flags && flags.length === 0 && !loading && (
            <div className="empty-state">
              No feature flags configured yet.
            </div>
          )}

          {flags && flags.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Enabled</th>
                    <th>Scope</th>
                    <th>League ID</th>
                    <th>Season ID</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedFlags.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <code>{f.key}</code>
                      </td>
                      <td>
                        <label className="badge-toggle">
                          <input
                            type="checkbox"
                            checked={f.enabled}
                            onChange={(e) =>
                              handleLocalChange(
                                f.key,
                                "enabled",
                                e.target.checked
                              )
                            }
                            disabled={savingKey === f.key}
                          />
                          <span
                            className={
                              "badge " +
                              (f.enabled
                                ? "badge-success"
                                : "badge-muted")
                            }
                          >
                            {f.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <select
                          className="input input-xs"
                          value={f.scope}
                          onChange={(e) =>
                            handleLocalChange(
                              f.key,
                              "scope",
                              e.target.value as AdminFeatureFlagRow["scope"]
                            )
                          }
                          disabled={savingKey === f.key}
                        >
                          <option value="global">Global</option>
                          <option value="league">League</option>
                          <option value="season">Season</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input input-xs"
                          type="number"
                          value={f.leagueId ?? ""}
                          onChange={(e) =>
                            handleLocalChange(
                              f.key,
                              "leagueId",
                              e.target.value
                                ? Number(e.target.value)
                                : null
                            )
                          }
                          disabled={savingKey === f.key}
                        />
                      </td>
                      <td>
                        <input
                          className="input input-xs"
                          type="number"
                          value={f.seasonId ?? ""}
                          onChange={(e) =>
                            handleLocalChange(
                              f.key,
                              "seasonId",
                              e.target.value
                                ? Number(e.target.value)
                                : null
                            )
                          }
                          disabled={savingKey === f.key}
                        />
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          disabled={savingKey === f.key}
                          onClick={() => handleSave(f)}
                        >
                          {savingKey === f.key ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-meta text-muted">
                {sortedFlags.length} feature flags
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
