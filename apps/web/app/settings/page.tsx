"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type HttpErrorWithStatus = Error & { status?: number };

// ---------------------------------------------
// Backend-aligned Settings structures
// ---------------------------------------------

type PrivacyLevel = "public" | "friends" | "private";

type SettingsPayload = {
  email?: string | null;
  timezone?: string | null;
  locale?: string | null;
  profileVisibility?: PrivacyLevel;
  socialVisibility?: PrivacyLevel;
  activityVisibility?: PrivacyLevel;
  notifyMatchReminders?: boolean;
  notifyDraftReminders?: boolean;
  notifyAnnouncements?: boolean;
  notifyInboxMessages?: boolean;
};

type UserSettings = SettingsPayload & {
  username?: string;
  createdAt?: string | null;
};

type SessionInfo = {
  id: string;
  device?: string | null;
  ip?: string | null;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  isCurrent?: boolean;
};

// ---------------------------------------------
// Fetch helper
// ---------------------------------------------

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
  } catch {}

  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    const err = new Error(message) as HttpErrorWithStatus;
    err.status = res.status;
    throw err;
  }

  return data as T;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

// ---------------------------------------------
// Page component
// ---------------------------------------------

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: ""
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // ---------------------------------------------
  // Load settings
  // ---------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingSettings(true);
      setSettingsError(null);

      try {
        const raw = await fetchJson<UserSettings>("/users/me/settings");
        if (cancelled) return;
        setSettings(raw);
      } catch (err: any) {
        if (cancelled) return;
        setSettingsError(err?.message ?? "Failed to load settings.");
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------
  // Load sessions
  // ---------------------------------------------

  useEffect(() => {
    let cancelled = false;
    async function loadSessions() {
      setLoadingSessions(true);
      setSessionError(null);
      try {
        const raw = await fetchJson<any>("/users/me/sessions");
        if (cancelled) return;

        const items = Array.isArray(raw) ? raw : raw.items ?? [];
        setSessions(
          items.map((s: any) => ({
            id: s.id,
            device: s.device ?? s.userAgent ?? s.user_agent ?? null,
            ip: s.ip ?? s.ipAddress ?? s.ip_address ?? null,
            createdAt: s.createdAt ?? s.created_at ?? null,
            lastSeenAt: s.lastSeenAt ?? s.last_seen_at ?? null,
            isCurrent: Boolean(s.isCurrent ?? s.current)
          }))
        );
      } catch (err: any) {
        if (cancelled) return;
        setSessionError(err?.message ?? "Failed to load sessions.");
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    }
    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------
  // Save settings
  // ---------------------------------------------

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setSaveSuccess(null);
    setGlobalError(null);

    const payload: SettingsPayload = {
      email: settings.email || null,
      timezone: settings.timezone || null,
      locale: settings.locale || null,
      profileVisibility: settings.profileVisibility,
      socialVisibility: settings.socialVisibility,
      activityVisibility: settings.activityVisibility,
      notifyMatchReminders: settings.notifyMatchReminders,
      notifyDraftReminders: settings.notifyDraftReminders,
      notifyAnnouncements: settings.notifyAnnouncements,
      notifyInboxMessages: settings.notifyInboxMessages
    };

    try {
      const updated = await fetchJson<UserSettings>("/users/me/settings", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setSettings(updated);
      setSaveSuccess("Settings saved.");
    } catch (err: any) {
      setGlobalError(err?.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------
  // Revoke session
  // ---------------------------------------------

  async function revokeSession(sessionId: string) {
    setSessionError(null);
    try {
      await fetchJson("/users/me/sessions/revoke", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      });

      const updated = await fetchJson<any>("/users/me/sessions");
      const items = Array.isArray(updated) ? updated : updated.items ?? [];

      setSessions(
        items.map((s: any) => ({
          id: s.id,
          device: s.device ?? s.userAgent ?? null,
          ip: s.ip ?? null,
          createdAt: s.createdAt ?? null,
          lastSeenAt: s.lastSeenAt ?? null,
          isCurrent: Boolean(s.isCurrent)
        }))
      );
    } catch (err: any) {
      setSessionError(err?.message ?? "Failed to revoke session.");
    }
  }

  // ---------------------------------------------
  // Password change
  // ---------------------------------------------

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError("New passwords do not match.");
      return;
    }

    try {
      setPasswordSaving(true);
      await fetchJson("/users/me/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      setPasswordSuccess("Password updated.");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirm: ""
      });
    } catch (err: any) {
      setPasswordError(err?.message ?? "Failed to change password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  // ---------------------------------------------
  // Render
  // ---------------------------------------------

  return (
    <main className="settings-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/dashboard" className="link">
              Dashboard
            </Link>{" "}
            / <span className="breadcrumb-current">Settings</span>
          </p>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage privacy, notifications, sessions, and account details.</p>
        </div>
      </header>

      {globalError && <div className="form-error">{globalError}</div>}
      {settingsError && <div className="form-error">{settingsError}</div>}
      {sessionError && <div className="form-error">{sessionError}</div>}
      {saveSuccess && <div className="form-success">{saveSuccess}</div>}
      {passwordError && <div className="form-error">{passwordError}</div>}
      {passwordSuccess && <div className="form-success">{passwordSuccess}</div>}

      <form onSubmit={saveSettings} className="stack stack-xl mt-md">
        {/* Account */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Account</h2>
            <p className="card-subtitle">Email, locale, and identity settings.</p>
          </div>
          <div className="card-body stack stack-sm">
            {!settings && loadingSettings && <div>Loading settings…</div>}
            {settings && (
              <>
                <div className="field">
                  <label className="field-label">Email</label>
                  <input
                    className="input input-sm"
                    value={settings.email ?? ""}
                    onChange={(e) =>
                      setSettings((prev) => prev && { ...prev, email: e.target.value })
                    }
                    placeholder="you@example.com"
                  />
                </div>

                <div className="field">
                  <label className="field-label">Timezone</label>
                  <input
                    className="input input-sm"
                    value={settings.timezone ?? ""}
                    onChange={(e) =>
                      setSettings((prev) => prev && { ...prev, timezone: e.target.value })
                    }
                    placeholder="e.g. Australia/Melbourne"
                  />
                </div>

                <div className="field">
                  <label className="field-label">Locale</label>
                  <input
                    className="input input-sm"
                    value={settings.locale ?? ""}
                    onChange={(e) =>
                      setSettings((prev) => prev && { ...prev, locale: e.target.value })
                    }
                    placeholder="en-AU"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Privacy */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Privacy</h2>
            <p className="card-subtitle">Choose who can see your profile, socials, and activity.</p>
          </div>
          <div className="card-body stack stack-sm">
            {settings && (
              <>
                <SettingSelect
                  label="Profile visibility"
                  value={settings.profileVisibility ?? "public"}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, profileVisibility: v })
                  }
                />
                <SettingSelect
                  label="Social links visibility"
                  value={settings.socialVisibility ?? "public"}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, socialVisibility: v })
                  }
                />
                <SettingSelect
                  label="Activity visibility"
                  value={settings.activityVisibility ?? "public"}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, activityVisibility: v })
                  }
                />
              </>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Notifications</h2>
            <p className="card-subtitle">Match reminders, draft alerts, announcements.</p>
          </div>
          <div className="card-body stack stack-sm">
            {settings && (
              <>
                <SettingToggle
                  label="Match reminders"
                  value={settings.notifyMatchReminders ?? false}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, notifyMatchReminders: v })
                  }
                />
                <SettingToggle
                  label="Draft reminders"
                  value={settings.notifyDraftReminders ?? false}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, notifyDraftReminders: v })
                  }
                />
                <SettingToggle
                  label="League announcements"
                  value={settings.notifyAnnouncements ?? false}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, notifyAnnouncements: v })
                  }
                />
                <SettingToggle
                  label="Inbox messages"
                  value={settings.notifyInboxMessages ?? false}
                  onChange={(v) =>
                    setSettings((prev) => prev && { ...prev, notifyInboxMessages: v })
                  }
                />
              </>
            )}
          </div>
        </section>

        {/* Save settings button */}
        <div className="field-row field-row--end">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={saving || loadingSettings}
          >
            {saving ? "Saving…" : "Save all settings"}
          </button>
        </div>
      </form>

      {/* Security */}
      <section className="card mt-xl">
        <div className="card-header">
          <h2 className="card-title">Security</h2>
          <p className="card-subtitle">Update password and manage sessions.</p>
        </div>

        <div className="card-body stack stack-lg">
          {/* CHANGE PASSWORD */}
          <form className="stack stack-sm" onSubmit={changePassword}>
            <div className="field">
              <label className="field-label">Current password</label>
              <input
                className="input input-sm"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                }
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">New password</label>
                <input
                  className="input input-sm"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label className="field-label">Confirm</label>
                <input
                  className="input input-sm"
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="field-row field-row--end">
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                disabled={passwordSaving}
              >
                {passwordSaving ? "Updating…" : "Change password"}
              </button>
            </div>
          </form>

          {/* SESSION LIST */}
          <div className="stack stack-sm">
            <h3 className="section-title text-sm">Active sessions</h3>

            {loadingSessions && sessions.length === 0 && <div>Loading sessions…</div>}

            {!loadingSessions && sessions.length === 0 && (
              <div className="empty-state">No active sessions.</div>
            )}

            {sessions.length > 0 && (
              <ul className="list list-divided">
                {sessions.map((s) => (
                  <li key={s.id} className="list-item">
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        <span className="pill pill-soft pill-xs">
                          {s.isCurrent ? "Current device" : s.device ?? "Session"}
                        </span>
                      </div>
                      <div className="list-item-meta-row">
                        <span className="text-muted text-xs">
                          IP: {s.ip ?? "—"}
                        </span>
                        <span className="text-muted text-xs ml-sm">
                          Created: {formatDate(s.createdAt)}
                        </span>
                        <span className="text-muted text-xs ml-sm">
                          Last seen: {formatDate(s.lastSeenAt)}
                        </span>
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <div className="list-item-actions">
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => revokeSession(s.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="card mt-xl">
        <div className="card-header">
          <h2 className="card-title text-danger">Danger zone</h2>
          <p className="card-subtitle">
            Permanently delete your account. This action cannot be undone.
          </p>
        </div>
        <div className="card-body">
          <button className="btn btn-danger btn-sm" disabled>
            Delete account (coming soon)
          </button>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------
// Small UI helpers
// ---------------------------------------------

function SettingSelect({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: PrivacyLevel) => void;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select
        className="input input-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as PrivacyLevel)}
      >
        <option value="public">Public</option>
        <option value="friends">Friends only</option>
        <option value="private">Private</option>
      </select>
    </div>
  );
}

function SettingToggle({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="field-row field-row--middle">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    </div>
  );
}
