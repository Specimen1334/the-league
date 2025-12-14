// apps/api/src/modules/users/users.schemas.ts

export type UserRole = "user" | "commissioner" | "superadmin";

export type ThemePreference = "light" | "dark" | "neon-gamer" | "gothic" | "pastel";

export type ProfileVisibility = "public" | "league" | "private";

export type MessagePrivacy = "anyone" | "league" | "friends" | "none";

export type FontScale = "normal" | "large" | "xlarge";

export type UserNotificationsSettings = {
  email?: boolean;
  push?: boolean;
  inApp?: boolean;
};

export type UserAccessibilitySettings = {
  fontScale?: FontScale;
  reducedMotion?: boolean;
  highContrast?: boolean;
};

export type UserSocialLinks = {
  discord?: string | null;
  twitch?: string | null;
  x?: string | null;
};

export type UserSettings = {
  timezone?: string | null;
  theme?: ThemePreference | null;
  profileVisibility?: ProfileVisibility;
  messagePrivacy?: MessagePrivacy;
  notifications?: UserNotificationsSettings;
  accessibility?: UserAccessibilitySettings;
  social?: UserSocialLinks;
  // extendable for future settings
};

export type UserProfileResponse = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: UserRole;
  createdAt: string;
  // Derived from settings_json
  avatarUrl: string | null;
  bio: string | null;
  settings: UserSettings;
};

/**
 * PATCH /users/me – lightweight profile edits.
 * Non-security fields (display name, avatar, bio, timezone, visibility, socials).
 */
export type UpdateMeBody = {
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  timezone?: string | null;
  theme?: ThemePreference | null;
  profileVisibility?: ProfileVisibility;
  messagePrivacy?: MessagePrivacy;
  social?: UserSocialLinks;
};

/**
 * PATCH /users/me/settings – deeper settings / preferences.
 */
export type UpdateSettingsBody = {
  timezone?: string | null;
  theme?: ThemePreference | null;
  notifications?: UserNotificationsSettings;
  accessibility?: UserAccessibilitySettings;
};

/**
 * POST /users/me/change-password
 */
export type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
};

/**
 * GET /users/me/settings response.
 */
export type UserSettingsResponse = {
  settings: UserSettings;
};
