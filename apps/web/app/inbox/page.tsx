"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

// -----------------------------
// Types – mirror inbox module
// -----------------------------

type InboxCategory =
  | "system"
  | "league"
  | "match"
  | "draft"
  | "trade"
  | "announcement"
  | "other"
  | string;

type InboxMessageSummary = {
  id: number;
  category: InboxCategory;
  type: string;
  title: string;
  preview: string;
  createdAt: string;
  read: boolean;
  archived: boolean;

  fromDisplayName?: string | null;

  relatedLeagueId?: number | null;
  relatedLeagueName?: string | null;
  relatedSeasonId?: number | null;
  relatedSeasonName?: string | null;
  relatedMatchId?: number | null;
  relatedTeamId?: number | null;

  hasReplies?: boolean;
};

type InboxReply = {
  id: number;
  fromDisplayName?: string | null;
  message: string;
  createdAt: string;
};

type InboxMessageDetail = InboxMessageSummary & {
  body: string;
  replies?: InboxReply[];
};

type InboxListResponse = {
  items: InboxMessageSummary[];
  page: number;
  limit: number;
  total: number;
  totalUnread: number;
};

type InboxFilterTab = "all" | "unread" | "archived";

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
      data?.error ||
      data?.message ||
      `Request failed with status ${res.status}`;
    const err = new Error(message);
    (err as any).status = res.status;
    throw err;
  }

  return data as T;
}

// -----------------------------
// Page component
// -----------------------------

export default function InboxPage() {
  const [tab, setTab] = useState<InboxFilterTab>("all");
  const [category, setCategory] = useState<string>("all");
  const [page, setPage] = useState<number>(1);

  const [list, setList] = useState<InboxListResponse | null>(null);
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InboxMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [bulkSelection, setBulkSelection] = useState<Set<number>>(
    () => new Set()
  );

  const [replyText, setReplyText] = useState<string>("");
  const [replySending, setReplySending] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [markAllLoading, setMarkAllLoading] = useState<boolean>(false);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const limit = 20;

  // -----------------------------
  // Load list whenever filters change
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setListLoading(true);
      setListError(null);
      setActionError(null);

      try {
        const query = new URLSearchParams();
        query.set("page", String(page));
        query.set("limit", String(limit));

        if (tab === "unread") query.set("read", "false");
        if (tab === "archived") query.set("archived", "true");
        if (category !== "all") query.set("category", category);

        const data = await fetchJson<InboxListResponse>(
          `/inbox?${query.toString()}`
        );
        if (cancelled) return;

        setList(data);
        setBulkSelection(new Set());

        // Auto-select first message if none selected or previous selection disappeared
        if (!selectedId || !data.items.some((m) => m.id === selectedId)) {
          const first = data.items[0];
          setSelectedId(first ? first.id : null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setListError(err?.message ?? "Failed to load inbox.");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    loadList();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, page]);

  // -----------------------------
  // Load detail when selectedId changes
  // -----------------------------
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError(null);
      setActionError(null);

      try {
        const data = await fetchJson<InboxMessageDetail>(
          `/inbox/${selectedId}`
        );
        if (cancelled) return;

        setDetail(data);

        // Locally mark as read in list
        setList((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((m) =>
                  m.id === selectedId ? { ...m, read: true } : m
                ),
                totalUnread:
                  prev.totalUnread > 0 && !data.read
                    ? prev.totalUnread - 1
                    : prev.totalUnread
              }
            : prev
        );
      } catch (err: any) {
        if (cancelled) return;
        setDetailError(err?.message ?? "Failed to load message.");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const messages = list?.items ?? [];

  const effectiveUnreadCount = useMemo(
    () => list?.totalUnread ?? 0,
    [list?.totalUnread]
  );

  const totalPages = useMemo(() => {
    if (!list) return 1;
    return Math.max(1, Math.ceil(list.total / list.limit));
  }, [list]);

  // -----------------------------
  // Actions
  // -----------------------------

  function toggleBulk(id: number) {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markSelectedAsRead(messageId: number) {
    setActionLoadingId(messageId);
    setActionError(null);
    try {
      await fetchJson<unknown>(`/inbox/${messageId}/read`, {
        method: "POST",
        body: JSON.stringify({})
      });

      setList((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((m) =>
                m.id === messageId ? { ...m, read: true } : m
              ),
              totalUnread:
                prev.totalUnread > 0
                  ? prev.totalUnread - (prev.items.find((m) => m.id === messageId && !m.read) ? 1 : 0)
                  : prev.totalUnread
            }
          : prev
      );
      if (detail && detail.id === messageId) {
        setDetail({ ...detail, read: true });
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to mark message as read.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function archiveMessage(messageId: number) {
    setActionLoadingId(messageId);
    setActionError(null);
    try {
      await fetchJson<unknown>(`/inbox/${messageId}/archive`, {
        method: "POST",
        body: JSON.stringify({})
      });

      setList((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items
                .map((m) =>
                  m.id === messageId ? { ...m, archived: true } : m
                )
                // optionally hide archived from non-archived tabs
                .filter((m) => (tab === "archived" ? true : !m.archived)),
              total: prev.total - (tab === "archived" ? 0 : 1)
            }
          : prev
      );
      if (detail && detail.id === messageId) {
        setDetail({ ...detail, archived: true });
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to archive message.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function markAllRead() {
    setMarkAllLoading(true);
    setActionError(null);
    try {
      await fetchJson<unknown>("/inbox/mark-all-read", {
        method: "POST",
        body: JSON.stringify({})
      });

      setList((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((m) => ({ ...m, read: true })),
              totalUnread: 0
            }
          : prev
      );
      if (detail) {
        setDetail({ ...detail, read: true });
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to mark all as read.");
    } finally {
      setMarkAllLoading(false);
    }
  }

  async function deleteSelected() {
    const ids = [...bulkSelection];
    if (ids.length === 0) return;

    setDeleteLoading(true);
    setActionError(null);
    try {
      await fetchJson<unknown>("/inbox/delete", {
        method: "POST",
        body: JSON.stringify({ ids })
      });

      setList((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((m) => !ids.includes(m.id)),
              total: Math.max(0, prev.total - ids.length),
              totalUnread: Math.max(
                0,
                prev.totalUnread -
                  prev.items.filter(
                    (m) => ids.includes(m.id) && !m.read
                  ).length
              )
            }
          : prev
      );

      if (detail && ids.includes(detail.id)) {
        setDetail(null);
        setSelectedId(null);
      }

      setBulkSelection(new Set());
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to delete messages.");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!detail || !replyText.trim()) return;

    setReplySending(true);
    setActionError(null);
    try {
      const updated = await fetchJson<InboxMessageDetail>(
        `/inbox/${detail.id}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ message: replyText.trim() })
        }
      );
      setDetail(updated);
      setReplyText("");
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to send reply.");
    } finally {
      setReplySending(false);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="inbox-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-subtitle">
            System messages, league invites, match updates, and commissioner
            announcements.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={markAllLoading || effectiveUnreadCount === 0}
            onClick={markAllRead}
          >
            {markAllLoading ? "Marking…" : "Mark all as read"}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={deleteLoading || bulkSelection.size === 0}
            onClick={deleteSelected}
          >
            {deleteLoading
              ? "Deleting…"
              : `Delete selected (${bulkSelection.size})`}
          </button>
        </div>
      </header>

      {(listError || actionError) && (
        <div className="form-error">
          {listError || actionError}
        </div>
      )}

      <div className="layout-two-column inbox-layout">
        {/* LEFT: message list + filters */}
        <section className="card inbox-list-card">
          <div className="card-header card-header--compact">
            <div className="tabs tabs--pill">
              <button
                type="button"
                className={
                  "tabs-item" + (tab === "all" ? " tabs-item--active" : "")
                }
                onClick={() => {
                  setTab("all");
                  setPage(1);
                }}
              >
                All
              </button>
              <button
                type="button"
                className={
                  "tabs-item" + (tab === "unread" ? " tabs-item--active" : "")
                }
                onClick={() => {
                  setTab("unread");
                  setPage(1);
                }}
              >
                Unread
                {effectiveUnreadCount > 0 && (
                  <span className="pill pill-accent pill-xs ml-xs">
                    {effectiveUnreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={
                  "tabs-item" + (tab === "archived" ? " tabs-item--active" : "")
                }
                onClick={() => {
                  setTab("archived");
                  setPage(1);
                }}
              >
                Archived
              </button>
            </div>

            <div className="inbox-filters">
              <select
                className="input input-xs"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All categories</option>
                <option value="league">League</option>
                <option value="season">Season</option>
                <option value="match">Match</option>
                <option value="draft">Draft</option>
                <option value="trade">Trade / marketplace</option>
                <option value="system">System</option>
                <option value="announcement">Announcements</option>
              </select>
            </div>
          </div>

          <div className="card-body card-body--scroll">
            {listLoading && !list && <div>Loading messages…</div>}

            {!listLoading && messages.length === 0 && (
              <div className="empty-state">
                No messages in this view.
              </div>
            )}

            {messages.length > 0 && (
              <ul className="list list-selectable inbox-list">
                {messages.map((msg) => {
                  const isSelected = msg.id === selectedId;
                  const inBulk = bulkSelection.has(msg.id);

                  const metaParts: string[] = [];
                  metaParts.push(
                    new Date(msg.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short"
                    })
                  );
                  if (msg.fromDisplayName) {
                    metaParts.push(`From: ${msg.fromDisplayName}`);
                  }

                  return (
                    <li
                      key={msg.id}
                      className={
                        "list-item inbox-list-item" +
                        (isSelected ? " list-item--active" : "")
                      }
                    >
                      <div className="inbox-list-item-main">
                        <div className="inbox-list-item-header">
                          <label className="checkbox-label inbox-checkbox">
                            <input
                              type="checkbox"
                              checked={inBulk}
                              onChange={() => toggleBulk(msg.id)}
                            />
                            <span />
                          </label>

                          <button
                            type="button"
                            className="inbox-list-item-button"
                            onClick={() => setSelectedId(msg.id)}
                          >
                            <div className="inbox-list-item-title-row">
                              <span
                                className={
                                  "inbox-list-title" +
                                  (msg.read ? " inbox-list-title--read" : "")
                                }
                              >
                                {msg.title}
                              </span>
                              <span className="pill pill-outline pill-xs">
                                {msg.category}
                              </span>
                              {!msg.read && (
                                <span className="badge badge-accent pill-xs">
                                  New
                                </span>
                              )}
                            </div>
                            <div className="inbox-list-item-meta">
                              <span className="text-muted">
                                {metaParts.join(" · ")}
                              </span>
                            </div>
                            <div className="inbox-list-item-preview">
                              <span className="text-muted">{msg.preview}</span>
                            </div>
                          </button>
                        </div>
                      </div>
                      <div className="inbox-list-item-actions">
                        {!msg.read && (
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            disabled={actionLoadingId === msg.id}
                            onClick={() => markSelectedAsRead(msg.id)}
                          >
                            {actionLoadingId === msg.id
                              ? "Marking…"
                              : "Mark read"}
                          </button>
                        )}
                        {!msg.archived && (
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            disabled={actionLoadingId === msg.id}
                            onClick={() => archiveMessage(msg.id)}
                          >
                            {actionLoadingId === msg.id
                              ? "Archiving…"
                              : "Archive"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {list && (
            <div className="card-footer inbox-pagination">
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Newer
              </button>
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((p) =>
                    list ? Math.min(totalPages, p + 1) : p + 1
                  )
                }
              >
                Older
              </button>
            </div>
          )}
        </section>

        {/* RIGHT: message detail */}
        <section className="card inbox-detail-card">
          <div className="card-header">
            <h2 className="card-title">
              {detail
                ? detail.title
                : listLoading
                ? "Loading…"
                : "No message selected"}
            </h2>
            {detail && (
              <p className="card-subtitle">
                {new Date(detail.createdAt).toLocaleString()} ·{" "}
                {detail.fromDisplayName
                  ? `From ${detail.fromDisplayName}`
                  : "System message"}
              </p>
            )}
          </div>

          <div className="card-body inbox-detail-body">
            {detailLoading && !detail && <div>Loading message…</div>}
            {detailError && <div className="form-error">{detailError}</div>}

            {detail && (
              <div className="stack stack-md">
                <div className="inbox-detail-meta">
                  <div className="stack stack-xs">
                    <div className="pill pill-outline pill-xs">
                      {detail.category}
                    </div>
                    <div className="text-muted text-sm">
                      Type: <code>{detail.type}</code>
                    </div>

                    <div className="inbox-detail-links">
                      {detail.relatedLeagueId && (
                        <Link
                          href={`/leagues/${detail.relatedLeagueId}`}
                          className="link"
                        >
                          View league
                          {detail.relatedLeagueName
                            ? `: ${detail.relatedLeagueName}`
                            : ""}
                        </Link>
                      )}
                      {detail.relatedSeasonId &&
                        detail.relatedLeagueId && (
                          <Link
                            href={`/leagues/${detail.relatedLeagueId}/seasons/${detail.relatedSeasonId}`}
                            className="link"
                          >
                            View season
                            {detail.relatedSeasonName
                              ? `: ${detail.relatedSeasonName}`
                              : ""}
                          </Link>
                        )}
                      {detail.relatedMatchId && (
                        <Link
                          href={`/matches/${detail.relatedMatchId}`}
                          className="link"
                        >
                          View match
                        </Link>
                      )}
                      {detail.relatedTeamId && (
                        <Link
                          href={`/teams/${detail.relatedTeamId}`}
                          className="link"
                        >
                          View team
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="inbox-detail-actions">
                    {!detail.read && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={actionLoadingId === detail.id}
                        onClick={() => markSelectedAsRead(detail.id)}
                      >
                        {actionLoadingId === detail.id
                          ? "Marking…"
                          : "Mark as read"}
                      </button>
                    )}
                    {!detail.archived && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={actionLoadingId === detail.id}
                        onClick={() => archiveMessage(detail.id)}
                      >
                        {actionLoadingId === detail.id
                          ? "Archiving…"
                          : "Archive"}
                      </button>
                    )}
                  </div>
                </div>

                <article className="inbox-detail-body-text">
                  <p className="inbox-body-paragraph">{detail.body}</p>
                </article>

                {detail.replies && detail.replies.length > 0 && (
                  <section className="inbox-thread">
                    <h3 className="thread-title">Conversation</h3>
                    <ul className="thread-list">
                      {detail.replies.map((r) => (
                        <li key={r.id} className="thread-item">
                          <div className="thread-item-header">
                            <span className="thread-author">
                              {r.fromDisplayName || "System"}
                            </span>
                            <span className="thread-date text-muted">
                              {new Date(r.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="thread-message">{r.message}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Reply form (for conversation-type messages) */}
                {detail.type === "conversation" && (
                  <section className="inbox-reply">
                    <h3 className="thread-title">Reply</h3>
                    <form
                      className="stack stack-sm"
                      onSubmit={sendReply}
                    >
                      <textarea
                        className="input textarea"
                        rows={3}
                        placeholder="Write a reply…"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        disabled={replySending}
                      />
                      <div className="inbox-reply-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={replySending || !replyText.trim()}
                        >
                          {replySending ? "Sending…" : "Send reply"}
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                {/* For non-conversation messages, a small hint */}
                {detail.type !== "conversation" && (
                  <p className="text-muted text-xs">
                    This message is informational only and does not support
                    direct replies.
                  </p>
                )}
              </div>
            )}

            {!detail && !detailLoading && (
              <div className="empty-state">
                Select a message from your inbox to view details.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
