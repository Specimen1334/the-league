// apps/api/src/modules/auth/sessions.repo.ts
import { randomUUID } from "crypto";
import { dbFile } from "../../db/index";
import { usersRepo } from "../users/users.repo";
import type { AppUser } from "../../shared/types";

export type SessionRecord = {
  id: string;
  userId: number;
  createdAt: string;
  expiresAt: string;
};

export const sessionsRepo = {
  createSession(userId: number, ttlDays: number): SessionRecord {
    const id = randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const createdAt = now.toISOString();
    const expiresAt = expires.toISOString();

    const stmt = dbFile.prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?)`
    );
    stmt.run(id, userId, createdAt, expiresAt);

    return { id, userId, createdAt, expiresAt };
  },

  getSessionWithUser(sessionId: string): { session: SessionRecord; user: AppUser } | null {
    const stmt = dbFile.prepare(
      `SELECT s.id, s.user_id, s.created_at, s.expires_at
       FROM sessions s
       WHERE s.id = ?`
    );
    const row = stmt.get(sessionId);
    if (!row) return null;

    const session: SessionRecord = {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };

    const user = usersRepo.findById(session.userId);
    if (!user) {
      return null;
    }

    // Check expiry
    if (new Date(session.expiresAt) <= new Date()) {
      this.deleteSession(session.id);
      return null;
    }

    return { session, user };
  },

  deleteSession(sessionId: string): void {
    const stmt = dbFile.prepare(`DELETE FROM sessions WHERE id = ?`);
    stmt.run(sessionId);
  },

  deleteUserSessions(userId: number): void {
    const stmt = dbFile.prepare(`DELETE FROM sessions WHERE user_id = ?`);
    stmt.run(userId);
  }
};
