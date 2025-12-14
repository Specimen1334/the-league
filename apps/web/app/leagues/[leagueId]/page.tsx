"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { apiFetchJson } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Use the shared API client (defaults to /api) to avoid cookie host mismatches.

type LeagueVisibility =
  | "public"
  | "private"
  | "password-protected"
  | "invite-only"
  | string;

type LeagueDetail = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  visibility: LeagueVisibility;
  ownerUserId: number;
  ownerUsername: string | null;
  memberCount: number;
  activeSeasonCount: number;
  createdAt: string;

  // backend fields
  isMember: boolean;
  myRole: "owner" | "commissioner" | "member" | null;
};

type LeagueSeasonSummary = {
  id: number;
  name: string;
  status:
    | "Signup"
    | "Drafting"
    | "Active"
    | "Playoffs"
    | "Completed"
    | "Archived"
    | string;
  formatType:
    | "RoundRobin"
    | "Swiss"
    | "SingleElim"
    | "DoubleElim"
    | "GroupsPlayoffs"
    | "Hybrid"
    | string;
  startsAt: string | null;
  endsAt: string | null;
};

type LeagueMember = {
  userId: number;
  username: string;
  displayName: string | null;
  role: "owner" | "commissioner" | "member" | string;
  joinedAt: string;
};

type UpdateLeagueBody = {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  visibility?: LeagueVisibility;
  password?: string | null;
};

type LeagueTab = "overview" | "seasons" | "members" | "settings";

function formatDate(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function mapLeagueDetail(raw: any): LeagueDetail {
  return {
    id: raw.id,
    name: raw.name ?? "Unnamed league",
    description: raw.description ?? null,
    logoUrl: raw.logoUrl ?? raw.logo_url ?? null,
    visibility: raw.visibility ?? "public",
    ownerUserId: raw.ownerUserId ?? raw.owner_user_id,
    ownerUsername: raw.ownerUsername ?? raw.owner_username ?? null,
    memberCount: raw.memberCount ?? raw.member_count ?? 0,
    activeSeasonCount: raw.activeSeasonCount ?? raw.active_season_count ?? 0,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    isMember: !!raw.isMember,
    myRole: raw.myRole ?? raw.my_role ?? null,
  };
}

function mapSeasons(raw: any): LeagueSeasonSummary[] {
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw)
    ? raw
    : [];
  return items.map((s: any) => ({
    id: s.id,
    name: s.name ?? "Unnamed season",
    status: s.status ?? "Unknown",
    formatType: s.formatType ?? s.format_type ?? "RoundRobin",
    startsAt: s.startsAt ?? s.starts_at ?? null,
    endsAt: s.endsAt ?? s.ends_at ?? null,
  }));
}

function mapMembers(raw: any): LeagueMember[] {
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw)
    ? raw
    : [];
  return items.map((m: any) => ({
    userId: m.userId ?? m.user_id,
    username: m.username ?? "unknown",
    displayName: m.displayName ?? m.display_name ?? null,
    role: m.role ?? "member",
    joinedAt: m.joinedAt ?? m.joined_at ?? "",
  }));
}

export default function LeagueHubPage() {
  const { leagueId } = useParams();
  const router = useRouter();
  const id = Number(leagueId);

  const toast = useToast();

  const [tab, setTab] = useState<LeagueTab>("overview");

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [seasons, setSeasons] = useState<LeagueSeasonSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // season creation
  const [isCreateSeasonOpen, setIsCreateSeasonOpen] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [creatingSeason, setCreatingSeason] = useState(false);

  // archive league
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archivingLeague, setArchivingLeague] = useState(false);

  // leave league
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [leavingLeague, setLeavingLeague] = useState(false);

  // settings form
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsVisibility, setSettingsVisibility] =
    useState<LeagueVisibility>("public");
  const [settingsSaving, setSettingsSaving] = useState(false);

  // member actions
  const [memberActionUserId, setMemberActionUserId] = useState<number | null>(
    null
  );

  const myRole = league?.myRole ?? null;
  const canManage = myRole === "owner" || myRole === "commissioner";
  const canArchive = myRole === "owner";
  const canLeave = myRole !== "owner";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [rawLeague, rawMembers, rawSeasons] = await Promise.all([
          apiFetchJson<any>(`/leagues/${id}`),
          apiFetchJson<any>(`/leagues/${id}/members`),
          apiFetchJson<any>(`/leagues/${id}/seasons`),
        ]);

        if (cancelled) return;

        const l = mapLeagueDetail(rawLeague);
        setLeague(l);
        setMembers(mapMembers(rawMembers));
        setSeasons(mapSeasons(rawSeasons));

        setSettingsName(l.name);
        setSettingsDescription(l.description ?? "");
        setSettingsVisibility(l.visibility);
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message ?? "Failed to load league hub.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(id) && id > 0) load();
    else {
      setError("Invalid league id.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function refreshSeasons() {
    const raw = await apiFetchJson<any>(`/leagues/${id}/seasons`);
    setSeasons(mapSeasons(raw));
  }

  async function submitCreateSeason() {
    if (!canManage) return;
    const trimmed = newSeasonName.trim();
    if (!trimmed) {
      toast.push({ kind: "error", title: "Season name required" });
      return;
    }

    setCreatingSeason(true);
    try {
      const created = await apiFetchJson<any>(`/leagues/${id}/seasons`, {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });

      await refreshSeasons();
      setIsCreateSeasonOpen(false);
      setNewSeasonName("");

      const seasonId: number | null =
        (typeof created?.id === "number" ? created.id : null) ??
        (typeof created?.seasonId === "number" ? created.seasonId : null);

      toast.push({ kind: "success", title: "Season created" });

      if (seasonId) {
        router.push(`/leagues/${id}/seasons/${seasonId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create season.";
      toast.push({ kind: "error", title: "Create season failed", message });
    } finally {
      setCreatingSeason(false);
    }
  }

  async function leaveLeague() {
    if (!league || !canLeave) return;

    setLeavingLeague(true);
    try {
      await apiFetchJson(`/leagues/${id}/leave`, { method: "POST" });
      toast.push({ kind: "success", title: "Left league" });
      router.push("/leagues");
    } catch (err: any) {
      toast.push({
        kind: "error",
        title: "Failed to leave league",
        message: err?.message ?? "Please try again.",
      });
    }
    finally {
      setLeavingLeague(false);
      setIsLeaveOpen(false);
    }
  }

  async function archiveLeague() {
    if (!league || !canArchive) return;
    setArchivingLeague(true);
    try {
      await apiFetchJson(`/leagues/${id}`, { method: "DELETE" });
      toast.push({ kind: "success", title: "League archived" });
      router.push("/leagues");
    } catch (err: any) {
      toast.push({
        kind: "error",
        title: "Archive failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setArchivingLeague(false);
      setIsArchiveOpen(false);
    }
  }

  async function promoteMember(member: LeagueMember) {
    if (!league || !canManage) return;
    setMemberActionUserId(member.userId);

    try {
      const res = await apiFetchJson<any>(
        `/leagues/${id}/members/${member.userId}/promote`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setMembers(mapMembers(res));
    } catch (err: any) {
      toast.push({
        kind: "error",
        title: "Promote failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setMemberActionUserId(null);
    }
  }

  async function demoteMember(member: LeagueMember) {
    if (!league || !canManage) return;
    setMemberActionUserId(member.userId);

    try {
      const res = await apiFetchJson<any>(
        `/leagues/${id}/members/${member.userId}/demote`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setMembers(mapMembers(res));
    } catch (err: any) {
      toast.push({
        kind: "error",
        title: "Demote failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setMemberActionUserId(null);
    }
  }

  async function kickMember(member: LeagueMember) {
    if (!league || !canManage) return;
    if (!confirm(`Kick ${member.displayName ?? member.username}?`)) return;

    setMemberActionUserId(member.userId);
    try {
      const res = await apiFetchJson<any>(
        `/leagues/${id}/members/${member.userId}`,
        { method: "DELETE" }
      );
      setMembers(mapMembers(res));
    } catch (err: any) {
      toast.push({
        kind: "error",
        title: "Kick failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setMemberActionUserId(null);
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!league || !canManage) return;

    setSettingsSaving(true);

    const body: UpdateLeagueBody = {
      name: settingsName.trim() || league.name,
      description: settingsDescription.trim() || null,
      visibility: settingsVisibility,
    };

    try {
      const updated = await apiFetchJson<any>(`/leagues/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const mapped = mapLeagueDetail(updated);
      setLeague(mapped);
      toast.push({ kind: "success", title: "Saved" });
    } catch (err: any) {
      toast.push({
        kind: "error",
        title: "Save failed",
        message: err?.message ?? "Please try again.",
      });
    } finally {
      setSettingsSaving(false);
    }
  }

  if (error) {
    return (
      <main className="app-shell">
        <div className="form-error">{error}</div>
      </main>
    );
  }

  if (loading || !league) {
    return (
      <main className="app-shell">
        <div className="card">
          <div className="card-body">Loading league…</div>
        </div>
      </main>
    );
  }

  const ownerLabel = league.ownerUsername
    ? league.ownerUsername
    : `User #${league.ownerUserId}`;

  return (
    <main className="app-shell">
      <PageShell>
        <PageHeader
          title={league.name}
          subtitle={league.description ?? undefined}
          breadcrumb={
            <>
              <Link href="/leagues" className="link">
                Leagues
              </Link>{" "}
              / <span className="breadcrumb-current">{league.name}</span>
            </>
          }
          actions={
            <Link href="/dashboard" className="btn btn-sm btn-ghost">
              Back to dashboard
            </Link>
          }
        />

        <section className="league-meta card">
          <div className="card-body league-meta-body">
            <div className="league-meta-left">
              <div className="league-avatar">
                <span className="league-avatar-initials">
                  {league.name.slice(0, 2).toUpperCase()}
                </span>
              </div>

              <div className="stack stack-xs">
                <div className="stack stack-xs">
                  <span className="pill pill-outline pill-xs">
                    {league.visibility}
                  </span>
                  <span className="text-muted text-xs">Owner: {ownerLabel}</span>
                </div>

                <div className="text-muted text-xs">
                  {league.memberCount} member{league.memberCount === 1 ? "" : "s"}
                </div>

                <div className="pill pill-soft pill-xs">
                  Your role: {league.myRole ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

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
              "tabs-item" + (tab === "seasons" ? " tabs-item--active" : "")
            }
            onClick={() => setTab("seasons")}
          >
            Seasons
          </button>

          <button
            type="button"
            className={
              "tabs-item" + (tab === "members" ? " tabs-item--active" : "")
            }
            onClick={() => setTab("members")}
          >
            Members
          </button>

          {canManage && (
            <button
              type="button"
              className={
                "tabs-item" +
                (tab === "settings" ? " tabs-item--active" : "")
              }
              onClick={() => setTab("settings")}
            >
              Settings
            </button>
          )}
        </div>

        <section className="league-tab-content">
          {tab === "overview" && (
            <div className="grid-2">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">At a glance</h2>
                  <p className="card-subtitle">League snapshot and quick actions.</p>
                </div>
                <div className="card-body">
                  <div className="text-muted text-xs">
                    Created: {formatDate(league.createdAt)}
                  </div>
                  <div className="text-muted text-xs">
                    Active seasons: {league.activeSeasonCount}
                  </div>
                  <div className="text-muted text-xs">
                    Members: {league.memberCount}
                  </div>
                  <div className="text-muted text-xs">
                    Your role: {league.myRole ?? "—"}
                  </div>

                  <div className="mt-md" />
                  <div className="stack stack-sm">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setTab("seasons")}
                    >
                      View all seasons
                    </button>
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => setIsCreateSeasonOpen(true)}
                      >
                        Create season
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Seasons</h2>
                  <p className="card-subtitle">Jump back into a season hub.</p>
                </div>
                <div className="card-body">
                  {seasons.length === 0 ? (
                    <EmptyState
                      title="No seasons yet"
                      message={
                        canManage
                          ? "Create the first season to start drafting."
                          : "A commissioner will create the first season."
                      }
                    />
                  ) : (
                    <ul className="list list-divided">
                      {seasons.slice(0, 4).map((s) => (
                        <li key={s.id} className="list-item">
                          <div className="list-item-main">
                            <div className="list-item-title-row">
                              <Link
                                href={`/leagues/${id}/seasons/${s.id}`}
                                className="link"
                              >
                                {s.name}
                              </Link>
                              <span className="badge badge-soft">{s.status}</span>
                            </div>
                            <div className="text-muted text-xs">
                              {s.formatType} • {formatDate(s.startsAt)} – {formatDate(s.endsAt)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "seasons" && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Seasons</h2>
              <p className="card-subtitle">Seasons in this league.</p>
            </div>

            <div className="card-body">
              {canManage && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setIsCreateSeasonOpen(true)}
                >
                  Create season
                </button>
              )}

              {seasons.length === 0 ? (
                <EmptyState title="No seasons yet" message={canManage ? "Create the first season to start drafting." : "A commissioner will create the first season."} />
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Format</th>
                        <th>Dates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasons.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <Link
                              href={`/leagues/${id}/seasons/${s.id}`}
                              className="link"
                            >
                              {s.name}
                            </Link>
                          </td>
                          <td>
                            <span className="badge badge-soft">{s.status}</span>
                          </td>
                          <td className="text-muted">{s.formatType}</td>
                          <td className="text-muted">
                            {formatDate(s.startsAt)} – {formatDate(s.endsAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          )}

          {tab === "members" && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Members</h2>
              <p className="card-subtitle">
                Everyone currently in this league.
              </p>
            </div>

            <div className="card-body">
              <ul className="list list-divided">
                {members.map((m) => {
                  const isOwner = m.userId === league.ownerUserId;
                  const display = m.displayName ?? m.username;

                  return (
                    <li key={m.userId} className="list-item">
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          <div className="pill pill-soft">{display}</div>
                          <span className="pill pill-outline pill-xs">
                            {isOwner ? "owner" : m.role}
                          </span>
                        </div>
                        <div className="text-muted text-xs">
                          Joined: {formatDate(m.joinedAt)}
                        </div>
                      </div>

                      <div className="list-item-actions">
                        {canManage && !isOwner && (
                          <>
                            {m.role === "member" ? (
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                onClick={() => promoteMember(m)}
                                disabled={memberActionUserId === m.userId}
                              >
                                {memberActionUserId === m.userId
                                  ? "Working…"
                                  : "Promote"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-xs btn-secondary"
                                onClick={() => demoteMember(m)}
                                disabled={memberActionUserId === m.userId}
                              >
                                {memberActionUserId === m.userId
                                  ? "Working…"
                                  : "Demote"}
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn btn-xs btn-danger"
                              onClick={() => kickMember(m)}
                              disabled={memberActionUserId === m.userId}
                            >
                              {memberActionUserId === m.userId
                                ? "Working…"
                                : "Kick"}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          )}

          {tab === "settings" && canManage && (
          <div className="stack stack-lg">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">League settings</h2>
                <p className="card-subtitle">
                  Edit league identity and visibility.
                </p>
              </div>

              <div className="card-body">
                <form className="form" onSubmit={saveSettings}>
                  <div className="form-row">
                    <label className="label">League name</label>
                    <input
                      className="input"
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <label className="label">Description</label>
                    <textarea
                      className="input"
                      rows={4}
                      value={settingsDescription}
                      onChange={(e) => setSettingsDescription(e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <label className="label">Visibility</label>
                    <select
                      className="input"
                      value={settingsVisibility}
                      onChange={(e) => setSettingsVisibility(e.target.value)}
                    >
                      <option value="public">public</option>
                      <option value="private">private</option>
                      <option value="password-protected">
                        password-protected
                      </option>
                      <option value="invite-only">invite-only</option>
                    </select>
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      type="submit"
                      disabled={settingsSaving}
                    >
                      {settingsSaving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section className="card card--danger">
              <div className="card-header">
                <h2 className="card-title">Danger zone</h2>
                <p className="card-subtitle">
                  Be careful — these actions can impact access and visibility.
                </p>
              </div>

              <div className="card-body">
                <div className="stack stack-sm">
                  {canLeave && (
                    <div className="danger-row">
                      <div>
                        <div className="text-strong">Leave league</div>
                        <div className="text-muted text-xs">
                          Removes you from this league.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setIsLeaveOpen(true)}
                        disabled={leavingLeague}
                      >
                        {leavingLeague ? "Leaving…" : "Leave"}
                      </button>
                    </div>
                  )}

                  {canArchive && (
                    <div className="danger-row">
                      <div>
                        <div className="text-strong">Archive league</div>
                        <div className="text-muted text-xs">
                          Removes this league from active lists. Archived leagues
                          can be restored by an admin if needed.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setIsArchiveOpen(true)}
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
          )}
        </section>

        <ConfirmDialog
          open={isCreateSeasonOpen}
          title="Create a season"
          description="Seasons live inside a league. You can configure settings after creation."
          confirmLabel="Create"
          confirmKind="primary"
          isBusy={creatingSeason}
          onCancel={() => {
            if (creatingSeason) return;
            setIsCreateSeasonOpen(false);
            setNewSeasonName("");
          }}
          onConfirm={submitCreateSeason}
        >
          <div className="form">
            <div className="form-row">
              <label className="label">Season name</label>
              <input
                className="input"
                value={newSeasonName}
                onChange={(e) => setNewSeasonName(e.target.value)}
                placeholder="Season 1"
                disabled={creatingSeason}
                autoFocus
              />
            </div>
          </div>
        </ConfirmDialog>

        <ConfirmDialog
          open={isLeaveOpen}
          title="Leave this league?"
          description="You will lose access to league seasons, drafts, and team pages unless re-invited."
          confirmLabel="Leave"
          confirmKind="danger"
          isBusy={leavingLeague}
          onCancel={() => {
            if (leavingLeague) return;
            setIsLeaveOpen(false);
          }}
          onConfirm={leaveLeague}
        />

        <ConfirmDialog
          open={isArchiveOpen}
          title="Archive this league?"
          description="This will remove it from active lists. You can’t run drafts or matches in an archived league."
          confirmLabel="Archive"
          confirmKind="danger"
          isBusy={archivingLeague}
          onCancel={() => {
            if (archivingLeague) return;
            setIsArchiveOpen(false);
          }}
          onConfirm={archiveLeague}
        />
      </PageShell>
    </main>
  );
}
