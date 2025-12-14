// apps/api/src/modules/users/users.repo.ts
import { dbFile } from "../../db/index";
import type { UserRole } from "./users.schemas";
import type { AppUser } from "../../shared/types";

export type RawUserRow = {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  role: UserRole;
  password_hash: string;
  created_at: string;
  settings_json: string | null;
};

function mapRowToAppUser(row: RawUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at
  };
}

export const usersRepo = {
  findById(id: number): RawUserRow | null {
    const stmt = dbFile.prepare(
      `SELECT id, username, display_name, email, role, password_hash, created_at, settings_json
       FROM users
       WHERE id = ?`
    );
    const row = stmt.get(id) as RawUserRow | undefined;
    return row ?? null;
  },

  findByUsername(username: string): RawUserRow | null {
    const stmt = dbFile.prepare(
      `SELECT id, username, display_name, email, role, password_hash, created_at, settings_json
       FROM users
       WHERE username = ?`
    );
    const row = stmt.get(username) as RawUserRow | undefined;
    return row ?? null;
  },

  findByEmail(email: string): RawUserRow | null {
    const stmt = dbFile.prepare(
      `SELECT id, username, display_name, email, role, password_hash, created_at, settings_json
       FROM users
       WHERE email = ?`
    );
    const row = stmt.get(email) as RawUserRow | undefined;
    return row ?? null;
  },

  createUser(username: string, passwordHash: string): RawUserRow {
    const stmt = dbFile.prepare(
      `INSERT INTO users (username, password_hash)
       VALUES (?, ?)`
    );
    const info = stmt.run(username, passwordHash);
    const id = Number(info.lastInsertRowid);

    const rowStmt = dbFile.prepare(
      `SELECT id, username, display_name, email, role, password_hash, created_at, settings_json
       FROM users
       WHERE id = ?`
    );
    const row = rowStmt.get(id) as RawUserRow | undefined;
    if (!row) {
      throw new Error("Failed to load user after creation");
    }
    return row;
  },

  updateDisplayNameAndSettings(
    userId: number,
    displayName: string | null | undefined,
    settingsJson: string | null | undefined
  ): RawUserRow | null {
    const stmt = dbFile.prepare(
      `UPDATE users
       SET
         display_name = COALESCE(?, display_name),
         settings_json = COALESCE(?, settings_json)
       WHERE id = ?`
    );

    stmt.run(displayName ?? null, settingsJson ?? null, userId);

    return this.findById(userId);
  },

  updateSettings(userId: number, settingsJson: string): RawUserRow | null {
    const stmt = dbFile.prepare(
      `UPDATE users
       SET settings_json = ?
       WHERE id = ?`
    );
    stmt.run(settingsJson, userId);
    return this.findById(userId);
  },

  updateRoleAndEnable(userId: number, role: UserRole): RawUserRow | null {
    // Note: disabled_at is added via schema evolution in db/index.ts
    const stmt = dbFile.prepare(
      `UPDATE users
       SET role = ?, disabled_at = NULL
       WHERE id = ?`
    );
    stmt.run(role, userId);
    return this.findById(userId);
  },

  updatePasswordHash(userId: number, newHash: string): void {
    const stmt = dbFile.prepare(
      `UPDATE users
       SET password_hash = ?
       WHERE id = ?`
    );
    stmt.run(newHash, userId);
  },

  /**
   * Admin/ops: update user role.
   */
  updateRole(userId: number, role: UserRole): RawUserRow | null {
    const stmt = dbFile.prepare(
      `UPDATE users
       SET role = ?
       WHERE id = ?`
    );
    stmt.run(role, userId);
    return this.findById(userId);
  },

  /**
   * Admin/ops: disable/enable. Uses disabled_at column (added by DB bootstrap).
   */
  setDisabledAt(userId: number, disabledAtIso: string | null): RawUserRow | null {
    const stmt = dbFile.prepare(
      `UPDATE users
       SET disabled_at = ?
       WHERE id = ?`
    );
    stmt.run(disabledAtIso, userId);
    return this.findById(userId);
  }
};
