"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type HttpErrorWithStatus = Error & { status?: number };

// -----------------------------
// Types aligned with design
// -----------------------------

type UserRole = "user" | "commissioner" | "superadmin" | string;

type UserBadge = {
  id?: number | string;
  label: string;
  description?: string | null;
  kind?: string | null; // e.g. "champion", "season-award"
};

type UserSocialLinks = {
  discord?: string | null;
  twitch?: string | null;
  twitter?: string | null;
  youtube?: string | null;
};

type UserProfile = {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  timezone?: string | null;
  country?: string | null;
  role?: UserRole;
  createdAt?: string | null;
  badges?: UserBadge[];
  social?: UserSocialLinks;
};

type UserTeamSummary = {
  teamId: number;
  teamName: string;
  leagueId: number;
  leagueName: string;
  seasonId?: number | null;
  seasonName?: string | null;
  roleLabel?: string | null; // Manager / Player
  recordSummary?: string | null;
  isActive?: boolean;
};

type ActivityItem = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  createdAt?: string | null;
  linkHref?: string | null;
};

// Form state for editable profile fields
type ProfileFormState = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  timezone: string;
  discord: string;
  twitch: string;
  twitter: string;
  youtube: string;
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

function mapUserProfile(raw: any): UserProfile {
  const socialRaw =
    raw.social ??
    raw.socialLinks ??
    raw.social_links ??
    {};

  const badgesRaw =
    raw.badges ??
    raw.achievements ??
    raw.awards ??
    [];

  const badges: UserBadge[] = Array.isArray(badgesRaw)
    ? badgesRaw.map((b: any) => {
        if (typeof b === "string") return { label: b };
        return {
          id: b.id ?? b.key ?? b.slug,
          label: b.label ?? b.name ?? "Badge",
          description: b.description ?? null,
          kind: b.kind ?? b.type ?? null
        };
      })
    : [];

  const social: UserSocialLinks = {
    discord:
      socialRaw.discord ??
      socialRaw.discordHandle ??
      socialRaw.discord_handle ??
      null,
    twitch:
      socialRaw.twitch ??
      socialRaw.twitchHandle ??
      socialRaw.twitch_handle ??
      null,
    twitter:
      socialRaw.twitter ??
      socialRaw.x ??
      socialRaw.twitterHandle ??
      socialRaw.twitter_handle ??
      null,
    youtube:
      socialRaw.youtube ??
      socialRaw.youtubeChannel ??
      socialRaw.youtube_channel ??
      null
  };

  return {
    id: raw.id ?? raw.userId ?? raw.user_id,
    username: raw.username,
    displayName: raw.displayName ?? raw.display_name ?? null,
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? null,
    bio: raw.bio ?? raw.about ?? null,
    timezone: raw.timezone ?? raw.time_zone ?? null,
    country: raw.country ?? raw.countryCode ?? raw.country_code ?? null,
    role: raw.role ?? raw.userRole ?? raw.user_role ?? "user",
    createdAt: raw.createdAt ?? raw.created_at ?? null,
    badges,
    social
  };
}

function mapTeams(raw: any): UserTeamSummary[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.teams ?? [];
  return (items as any[]).map((t) => ({
    teamId: t.teamId ?? t.team_id,
    teamName: t.teamName ?? t.team_name,
    leagueId: t.leagueId ?? t.league_id,
    leagueName: t.leagueName ?? t.league_name ?? "League",
    seasonId: t.seasonId ?? t.season_id ?? null,
    seasonName: t.seasonName ?? t.season_name ?? null,
    roleLabel:
      t.roleLabel ??
      t.role_label ??
      t.membershipRole ??
      t.membership_role ??
      null,
    recordSummary:
      t.recordSummary ??
      t.record_summary ??
      t.record ??
      null,
    isActive: Boolean(t.isActive ?? t.active ?? true)
  }));
}

function mapActivity(raw: any): ActivityItem[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.activity ?? [];
  return (items as any[]).map((a, idx) => ({
    id:
      String(a.id ?? a.activityId ?? a.activity_id ?? idx),
    type: a.type ?? a.kind ?? "activity",
    title:
      a.title ??
      a.summary ??
      a.description ??
      "Activity",
    description: a.description ?? a.details ?? null,
    createdAt: a.createdAt ?? a.created_at ?? null,
    linkHref:
      a.link ??
      a.href ??
      (a.leagueId
        ? `/leagues/${a.leagueId}`
        : a.matchId
        ? `/matches/${a.matchId}`
        : null)
  }));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

// -----------------------------
// Page component
// -----------------------------

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [teams, setTeams] = useState<UserTeamSummary[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [form, setForm] = useState<ProfileFormState>({
    displayName: "",
    avatarUrl: "",
    bio: "",
    timezone: "",
    discord: "",
    twitch: "",
    twitter: "",
    youtube: ""
  });

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(
    null
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // -----------------------------
  // Load profile
  // -----------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      setProfileError(null);
      setGlobalError(null);
      try {
        const raw = await fetchJson<any>("/users/me");
        if (cancelled) return;
        const mapped = mapUserProfile(raw);
        setProfile(mapped);
        setForm({
          displayName: mapped.displayName ?? "",
          avatarUrl: mapped.avatarUrl ?? "",
          bio: mapped.bio ?? "",
          timezone: mapped.timezone ?? "",
          discord: mapped.social?.discord ?? "",
          twitch: mapped.social?.twitch ?? "",
          twitter: mapped.social?.twitter ?? "",
          youtube: mapped.social?.youtube ?? ""
        });
      } catch (err: any) {
        if (cancelled) return;
        setProfileError(
          err?.message ?? "Failed to load your profile."
        );
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------
  // Load teams
  // -----------------------------

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      setLoadingTeams(true);
      setTeamsError(null);
      try {
        const raw = await fetchJson<any>("/users/me/teams");
        if (cancelled) return;
        setTeams(mapTeams(raw));
      } catch (err: any) {
        if (cancelled) return;
        setTeamsError(
          err?.message ?? "Failed to load your teams."
        );
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    }
    loadTeams();
    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------
  // Load activity
  // -----------------------------

  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      setLoadingActivity(true);
      setActivityError(null);
      try {
        const raw = await fetchJson<any>("/users/me/activity");
        if (cancelled) return;
        setActivity(mapActivity(raw));
      } catch (err: any) {
        if (cancelled) return;
        setActivityError(
          err?.message ?? "Failed to load recent activity."
        );
      } finally {
        if (!cancelled) setLoadingActivity(false);
      }
    }
    loadActivity();
    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------
  // Save profile
  // -----------------------------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setGlobalError(null);
    setSaveSuccess(null);

    // Build payload according to backend's user update schema:
    const payload: any = {
      displayName: form.displayName || null,
      avatarUrl: form.avatarUrl || null,
      bio: form.bio || null,
      timezone: form.timezone || null,
      social: {
        discord: form.discord || null,
        twitch: form.twitch || null,
        twitter: form.twitter || null,
        youtube: form.youtube || null
      }
    };

    try {
      const raw = await fetchJson<any>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      const updated = mapUserProfile(raw);
      setProfile(updated);
      setSaveSuccess("Profile updated.");
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to save profile changes."
      );
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------
  // Derived
  // -----------------------------

  const mainBadge = useMemo(
    () => profile?.badges?.[0] ?? null,
    [profile]
  );

  const extraBadges = useMemo(
    () =>
      profile?.badges && profile.badges.length > 1
        ? profile.badges.slice(1)
        : [],
    [profile]
  );

  const activeTeams = teams.filter((t) => t.isActive);
  const pastTeams = teams.filter((t) => !t.isActive);

  const listBusy =
    loadingTeams && teams.length === 0;

  const activityBusy =
    loadingActivity && activity.length === 0;

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="profile-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/dashboard" className="link">
              Dashboard
            </Link>{" "}
            /{" "}
            <span className="breadcrumb-current">Profile</span>
          </p>
          <h1 className="page-title">Your profile</h1>
          <p className="page-subtitle">
            Personal identity, social presence, and a quick overview of your
            teams and activity.
          </p>
        </div>
        {profile && (
          <div className="page-header-actions">
            <span className="pill pill-soft pill-xs">
              @{profile.username}
            </span>
            {profile.role && (
              <span className="pill pill-outline pill-xs ml-xs">
                {profile.role}
              </span>
            )}
          </div>
        )}
      </header>

      {globalError && <div className="form-error">{globalError}</div>}
      {profileError && (
        <div className="form-error">{profileError}</div>
      )}
      {teamsError && <div className="form-error">{teamsError}</div>}
      {activityError && (
        <div className="form-error">{activityError}</div>
      )}
      {saveSuccess && (
        <div className="form-success">{saveSuccess}</div>
      )}

      <div className="layout-two-column profile-layout mt-md">
        {/* LEFT: identity card & social / badges */}
        <section className="stack stack-lg">
          <div className="card">
            <div className="card-body profile-identity">
              <div className="profile-avatar-block">
                {profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName ?? profile.username}
                    className="profile-avatar"
                  />
                ) : (
                  <div className="profile-avatar profile-avatar--placeholder">
                    <span>
                      {(profile?.displayName ??
                        profile?.username ??
                        "?")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="profile-identity-main">
                <div className="stack stack-xs">
                  <h2 className="section-title">
                    {profile?.displayName ?? profile?.username ?? "Player"}
                  </h2>
                  {profile && (
                    <span className="text-muted text-xs">
                      Joined {formatDate(profile.createdAt)}
                    </span>
                  )}
                  {profile?.bio && (
                    <p className="text-muted text-xs">
                      {profile.bio}
                    </p>
                  )}
                </div>

                <div className="pill-row mt-xs">
                  {profile?.timezone && (
                    <span className="pill pill-soft pill-xs">
                      Timezone: {profile.timezone}
                    </span>
                  )}
                  {profile?.country && (
                    <span className="pill pill-outline pill-xs">
                      {profile.country}
                    </span>
                  )}
                  {mainBadge && (
                    <span className="pill pill-accent pill-xs">
                      {mainBadge.label}
                    </span>
                  )}
                </div>

                {extraBadges.length > 0 && (
                  <div className="pill-row mt-xs">
                    {extraBadges.slice(0, 4).map((b) => (
                      <span
                        key={b.id ?? b.label}
                        className="badge badge-soft badge-xs"
                      >
                        {b.label}
                      </span>
                    ))}
                    {extraBadges.length > 4 && (
                      <span className="text-muted text-xxs">
                        +{extraBadges.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Social presence</h2>
              <p className="card-subtitle">
                Optional links to Discord, Twitch, and other platforms.
              </p>
            </div>
            <div className="card-body">
              <div className="stack stack-xs text-xs">
                {form.discord && (
                  <div>
                    <span className="text-muted">Discord:</span>{" "}
                    <span>{form.discord}</span>
                  </div>
                )}
                {form.twitch && (
                  <div>
                    <span className="text-muted">Twitch:</span>{" "}
                    <a
                      href={`https://twitch.tv/${form.twitch.replace(
                        /^@/,
                        ""
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {form.twitch}
                    </a>
                  </div>
                )}
                {form.twitter && (
                  <div>
                    <span className="text-muted">X / Twitter:</span>{" "}
                    <a
                      href={`https://x.com/${form.twitter.replace(
                        /^@/,
                        ""
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {form.twitter}
                    </a>
                  </div>
                )}
                {form.youtube && (
                  <div>
                    <span className="text-muted">YouTube:</span>{" "}
                    <a
                      href={form.youtube}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {form.youtube}
                    </a>
                  </div>
                )}
                {!form.discord &&
                  !form.twitch &&
                  !form.twitter &&
                  !form.youtube && (
                    <p className="text-muted text-xs">
                      Add social links in the edit form to show other players
                      where you stream or hang out.
                    </p>
                  )}
              </div>
            </div>
            <div className="card-footer">
              <span className="text-muted text-xxs">
                Visibility of your profile and social links is controlled from
                Settings → Privacy.
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT: edit form + teams + activity */}
        <section className="stack stack-lg">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Edit profile</h2>
              <p className="card-subtitle">
                Display name, avatar, bio, and timezone. Changes apply
                everywhere in The League.
              </p>
            </div>
            <div className="card-body">
              <form
                className="stack stack-sm"
                onSubmit={handleSubmit}
              >
                <div className="field">
                  <label className="field-label">Display name</label>
                  <input
                    className="input input-sm"
                    value={form.displayName}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        displayName: e.target.value
                      }))
                    }
                    placeholder="What other players see"
                  />
                </div>

                <div className="field">
                  <label className="field-label">
                    Avatar URL (optional)
                  </label>
                  <input
                    className="input input-sm"
                    value={form.avatarUrl}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        avatarUrl: e.target.value
                      }))
                    }
                    placeholder="https://…"
                  />
                  <p className="field-hint">
                    Use a square image for best results (e.g., 256×256).
                  </p>
                </div>

                <div className="field">
                  <label className="field-label">Bio</label>
                  <textarea
                    className="input input-sm"
                    rows={3}
                    value={form.bio}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        bio: e.target.value
                      }))
                    }
                    placeholder="Short intro, playstyle, or favourite archetypes…"
                  />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Timezone</label>
                    <input
                      className="input input-sm"
                      value={form.timezone}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          timezone: e.target.value
                        }))
                      }
                      placeholder="e.g. Australia/Melbourne"
                    />
                    <p className="field-hint">
                      Used for scheduling drafts and matches.
                    </p>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Discord</label>
                    <input
                      className="input input-sm"
                      value={form.discord}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          discord: e.target.value
                        }))
                      }
                      placeholder="username#0000 or @handle"
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Twitch</label>
                    <input
                      className="input input-sm"
                      value={form.twitch}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          twitch: e.target.value
                        }))
                      }
                      placeholder="@channel"
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field-label">
                      X / Twitter
                    </label>
                    <input
                      className="input input-sm"
                      value={form.twitter}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          twitter: e.target.value
                        }))
                      }
                      placeholder="@handle"
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">
                      YouTube (channel or link)
                    </label>
                    <input
                      className="input input-sm"
                      value={form.youtube}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          youtube: e.target.value
                        }))
                      }
                      placeholder="https://youtube.com/…"
                    />
                  </div>
                </div>

                <div className="field-row field-row--end">
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    disabled={saving || loadingProfile}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Teams overview */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Teams overview</h2>
              <p className="card-subtitle">
                Quick links to your active and past teams across all leagues.
              </p>
            </div>
            <div className="card-body">
              {listBusy && <div>Loading teams…</div>}

              {!listBusy && teams.length === 0 && (
                <div className="empty-state">
                  You&apos;re not on any teams yet. Join or create a league to
                  get started.
                </div>
              )}

              {activeTeams.length > 0 && (
                <div className="stack stack-xs mb-sm">
                  <span className="section-label text-xs">
                    Active teams
                  </span>
                  <ul className="list list-divided">
                    {activeTeams.map((t) => (
                      <li
                        key={t.teamId}
                        className="list-item list-item--dense"
                      >
                        <div className="list-item-main">
                          <div className="list-item-title-row">
                            <Link
                              href={`/teams/${t.teamId}`}
                              className="link"
                            >
                              {t.teamName}
                            </Link>
                            {t.roleLabel && (
                              <span className="pill pill-soft pill-xs ml-xs">
                                {t.roleLabel}
                              </span>
                            )}
                          </div>
                          <div className="list-item-meta-row">
                            <span className="text-muted text-xs">
                              {t.leagueName}
                              {t.seasonName
                                ? ` • ${t.seasonName}`
                                : ""}
                            </span>
                            {t.recordSummary && (
                              <span className="badge badge-soft badge-xs ml-xs">
                                {t.recordSummary}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pastTeams.length > 0 && (
                <div className="stack stack-xs mt-sm">
                  <span className="section-label text-xs">
                    Past teams
                  </span>
                  <ul className="list list-divided">
                    {pastTeams.slice(0, 5).map((t) => (
                      <li
                        key={t.teamId}
                        className="list-item list-item--dense"
                      >
                        <div className="list-item-main">
                          <div className="list-item-title-row">
                            <Link
                              href={`/teams/${t.teamId}`}
                              className="link"
                            >
                              {t.teamName}
                            </Link>
                          </div>
                          <div className="list-item-meta-row">
                            <span className="text-muted text-xs">
                              {t.leagueName}
                              {t.seasonName
                                ? ` • ${t.seasonName}`
                                : ""}
                            </span>
                            {t.recordSummary && (
                              <span className="badge badge-soft badge-xs ml-xs">
                                {t.recordSummary}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {pastTeams.length > 5 && (
                    <p className="text-muted text-xxs">
                      +{pastTeams.length - 5} more past teams
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Recent activity</h2>
              <p className="card-subtitle">
                Join events, drafts, match reports, and other recent actions.
              </p>
            </div>
            <div className="card-body">
              {activityBusy && (
                <div>Loading recent activity…</div>
              )}

              {!activityBusy && activity.length === 0 && (
                <div className="empty-state">
                  No recent activity recorded yet. As you join leagues, play
                  matches, and draft, they&apos;ll show up here.
                </div>
              )}

              {activity.length > 0 && (
                <ul className="list list-divided">
                  {activity.slice(0, 10).map((a) => (
                    <li
                      key={a.id}
                      className="list-item list-item--dense"
                    >
                      <div className="list-item-main">
                        <div className="list-item-title-row">
                          {a.linkHref ? (
                            <Link
                              href={a.linkHref}
                              className="link"
                            >
                              {a.title}
                            </Link>
                          ) : (
                            <span>{a.title}</span>
                          )}
                          <span className="badge badge-soft badge-xs ml-xs">
                            {a.type}
                          </span>
                        </div>
                        {a.description && (
                          <div className="list-item-meta-row">
                            <span className="text-muted text-xs">
                              {a.description}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="list-item-actions">
                        <span className="text-muted text-xxs">
                          {formatDate(a.createdAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
