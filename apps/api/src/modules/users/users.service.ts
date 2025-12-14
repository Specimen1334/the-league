// apps/api/src/modules/users/users.service.ts
import argon2 from "argon2";
import { usersRepo } from "./users.repo";
import { sessionsRepo } from "../auth/sessions.repo";
import { safeParseJson, mergeJson } from "../../shared/validation";
import { createHttpError } from "../../shared/errors";
import type {
  UserSettings,
  UserProfileResponse,
  UpdateMeBody,
  UpdateSettingsBody,
  ChangePasswordBody
} from "./users.schemas";
import type { AppUser } from "../../shared/types";

function parseSettings(settingsJson: string | null): UserSettings {
  return safeParseJson<UserSettings>(settingsJson);
}

function buildProfileResponse(row: ReturnType<typeof usersRepo.findById>): UserProfileResponse {
  if (!row) {
    throw createHttpError(404, "User not found", "NotFound");
  }

  const settings = parseSettings(row.settings_json);

  // We treat avatarUrl and bio as part of settings, but surface them top-level too.
  const avatarUrl =
    (settings as any).avatarUrl ??
    null;
  const bio =
    (settings as any).bio ??
    null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    avatarUrl,
    bio,
    settings
  };
}

export const usersService = {
  /**
   * Get full profile for the authenticated user.
   */
  getProfileForSelf(user: AppUser): UserProfileResponse {
    const row = usersRepo.findById(user.id);
    return buildProfileResponse(row);
  },

  /**
   * Public profile view (for /users/:userId).
   * For now we simply hide email; privacy rules can be tightened later.
   */
  getPublicProfile(targetUserId: number): UserProfileResponse {
    const row = usersRepo.findById(targetUserId);
    const profile = buildProfileResponse(row);
    return {
      ...profile,
      email: null // never expose email on public profile
    };
  },

  /**
   * PATCH /users/me – update displayName + high-level profile bits.
   */
  updateMe(user: AppUser, body: UpdateMeBody): UserProfileResponse {
    const current = usersRepo.findById(user.id);
    if (!current) {
      throw createHttpError(404, "User not found", "NotFound");
    }

    const existingSettings = parseSettings(current.settings_json);

    const patch: Partial<UserSettings> & {
      avatarUrl?: string | null;
      bio?: string | null;
    } = { ...existingSettings };

    if (body.avatarUrl !== undefined) {
      (patch as any).avatarUrl = body.avatarUrl;
    }
    if (body.bio !== undefined) {
      (patch as any).bio = body.bio;
    }
    if (body.timezone !== undefined) {
      patch.timezone = body.timezone;
    }
    if (body.theme !== undefined) {
      patch.theme = body.theme;
    }
    if (body.profileVisibility !== undefined) {
      patch.profileVisibility = body.profileVisibility;
    }
    if (body.messagePrivacy !== undefined) {
      patch.messagePrivacy = body.messagePrivacy;
    }
    if (body.social !== undefined) {
      patch.social = {
        ...(existingSettings.social ?? {}),
        ...body.social
      };
    }

    const newSettingsJson = mergeJson<UserSettings>(existingSettings, patch);
    const updated = usersRepo.updateDisplayNameAndSettings(
      user.id,
      body.displayName ?? undefined,
      newSettingsJson
    );

    return buildProfileResponse(updated);
  },

  /**
   * GET /users/me/settings
   */
  getSettings(user: AppUser): UserSettings {
    const row = usersRepo.findById(user.id);
    if (!row) {
      throw createHttpError(404, "User not found", "NotFound");
    }
    return parseSettings(row.settings_json);
  },

  /**
   * PATCH /users/me/settings
   */
  updateSettings(user: AppUser, body: UpdateSettingsBody): UserSettings {
    const row = usersRepo.findById(user.id);
    if (!row) {
      throw createHttpError(404, "User not found", "NotFound");
    }

    const existing = parseSettings(row.settings_json);
    const patch: Partial<UserSettings> = {
      ...existing
    };

    if (body.timezone !== undefined) {
      patch.timezone = body.timezone;
    }
    if (body.theme !== undefined) {
      patch.theme = body.theme;
    }
    if (body.notifications !== undefined) {
      patch.notifications = {
        ...(existing.notifications ?? {}),
        ...body.notifications
      };
    }
    if (body.accessibility !== undefined) {
      patch.accessibility = {
        ...(existing.accessibility ?? {}),
        ...body.accessibility
      };
    }

    const newSettingsJson = mergeJson<UserSettings>(existing, patch);
    const updated = usersRepo.updateSettings(user.id, newSettingsJson);
    const updatedSettings = parseSettings(updated?.settings_json ?? null);
    return updatedSettings;
  },

  /**
   * POST /users/me/change-password
   */
  async changePassword(user: AppUser, body: ChangePasswordBody): Promise<void> {
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      throw createHttpError(
        400,
        "Current password and new password are required",
        "BadRequest"
      );
    }

    if (newPassword.length < 6) {
      throw createHttpError(
        400,
        "New password must be at least 6 characters",
        "BadRequest",
        { field: "newPassword" }
      );
    }

    const row = usersRepo.findById(user.id);
    if (!row) {
      throw createHttpError(404, "User not found", "NotFound");
    }

    const matches = await argon2.verify(row.password_hash, currentPassword);
    if (!matches) {
      throw createHttpError(401, "Current password is incorrect", "Unauthorized");
    }

    const hash = await argon2.hash(newPassword);
    usersRepo.updatePasswordHash(user.id, hash);
  },

  /**
   * POST /users/me/sessions/logout-all
   */
  async logoutAllSessions(user: AppUser): Promise<void> {
    sessionsRepo.deleteUserSessions(user.id);
  }
};
