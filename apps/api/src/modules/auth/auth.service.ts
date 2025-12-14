// apps/api/src/modules/auth/auth.service.ts
import argon2 from "argon2";
import { usersRepo } from "../users/users.repo";
import { sessionsRepo } from "./sessions.repo";
import { createHttpError } from "../../shared/errors";
import type { AppUser } from "../../shared/types";
import type { RegisterBody, LoginBody, AuthUserResponse } from "./auth.schemas";

function toAuthUserResponse(user: AppUser): AuthUserResponse {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

export const authService = {
  async register(body: RegisterBody): Promise<{ user: AuthUserResponse; sessionId: string }> {
    const username = body.username?.trim();
    const password = body.password;

    if (!username || username.length < 3) {
      throw createHttpError(400, "Username must be at least 3 characters", "BadRequest", {
        field: "username"
      });
    }
    if (!password || password.length < 6) {
      throw createHttpError(
        400,
        "Password must be at least 6 characters",
        "BadRequest",
        { field: "password" }
      );
    }

    const existing = usersRepo.findByUsername(username);
    if (existing) {
      throw createHttpError(409, "Username already taken", "Conflict", {
        field: "username"
      });
    }

    const hash = await argon2.hash(password);
    const user = usersRepo.createUser(username, hash);
    const session = sessionsRepo.createSession(user.id, 30); // 30 days default

    return { user: toAuthUserResponse(user), sessionId: session.id };
  },

  async login(body: LoginBody): Promise<{ user: AuthUserResponse; sessionId: string }> {
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      throw createHttpError(400, "Username and password are required", "BadRequest");
    }

    const row = usersRepo.findByUsername(username);
    if (!row) {
      throw createHttpError(401, "Invalid username or password", "Unauthorized");
    }

    const isValid = await argon2.verify(row.password_hash, password);
    if (!isValid) {
      throw createHttpError(401, "Invalid username or password", "Unauthorized");
    }

    const user: AppUser = {
      id: row.id,
      username: row.username,
      displayName: row.display_name ?? null,
      email: row.email ?? null,
      role: row.role as any,
      createdAt: row.created_at
    };

    const ttlDays = body.rememberMe ? 30 : 7;
    const session = sessionsRepo.createSession(user.id, ttlDays);

    return { user: toAuthUserResponse(user), sessionId: session.id };
  }
};
