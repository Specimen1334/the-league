// apps/api/src/modules/leagues/leagues.schemas.ts

export type LeagueVisibility =
  | "public"
  | "private"
  | "password-protected"
  | "invite-only";

export type LeagueMemberRole = "owner" | "commissioner" | "member";

export type CreateLeagueBody = {
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  visibility: LeagueVisibility;
  password?: string | null; // only for password-protected
  sport?: string | null;    // future extension
};

export type UpdateLeagueBody = {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  visibility?: LeagueVisibility;
  password?: string | null; // null/empty to clear password
};

export type DiscoverLeaguesQuery = {
  search?: string;
  visibility?: LeagueVisibility | "all";
  page?: number;
  limit?: number;
};

export type LeagueSummary = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  visibility: LeagueVisibility;
  ownerUserId: number;
  ownerUsername: string | null;
  memberCount: number;
  activeSeasonCount: number;
};

export type LeagueMemberSummary = {
  userId: number;
  username: string;
  displayName: string | null;
  role: LeagueMemberRole;
  joinedAt: string;
};

export type LeagueDetail = LeagueSummary & {
  createdAt: string;
  isMember: boolean;
  myRole: LeagueMemberRole | null;
};

export type LeagueSeasonSummary = {
  id: number;
  name: string;
  status:
    | "Signup"
    | "Drafting"
    | "Active"
    | "Playoffs"
    | "Completed"
    | "Archived";
  formatType:
    | "RoundRobin"
    | "Swiss"
    | "SingleElim"
    | "DoubleElim"
    | "GroupsPlayoffs"
    | "Hybrid";
  startsAt: string | null;
  endsAt: string | null;
};

export type JoinLeagueBody = {
  password?: string | null;
  // future: inviteCode?: string;
};

export type InviteToLeagueBody = {
  usernameOrEmail: string;
};

export type PromoteDemoteBody = {
  // no body needed for now, but kept for forward compatibility
};

export type BasePaginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
