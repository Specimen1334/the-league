// apps/api/src/modules/leagues/leagues.service.ts
import argon2 from "argon2";
import { leaguesRepo } from "./leagues.repo";
import {
  type LeagueVisibility,
  type LeagueMemberRole,
  type CreateLeagueBody,
  type UpdateLeagueBody,
  type DiscoverLeaguesQuery,
  type LeagueSummary,
  type LeagueDetail,
  type LeagueMemberSummary,
  type LeagueSeasonSummary,
  type JoinLeagueBody,
  type BasePaginated
} from "./leagues.schemas";
import { toLimitOffset, toPaginatedResult } from "../../shared/pagination";
import { createHttpError } from "../../shared/errors";
import type { AppUser } from "../../shared/types";
import { seasonsRepo } from "../seasons/seasons.repo";
import type { CreateSeasonBody } from "../seasons/seasons.schemas";

function ensureLeagueExists(leagueId: number) {
  const league = leaguesRepo.findById(leagueId);
  if (!league) {
    throw createHttpError(404, "League not found", "NotFound");
  }
  return league;
}

function requireLeagueRole(
  leagueId: number,
  userId: number,
  allowed: LeagueMemberRole[] | "owner-only"
): LeagueMemberRole {
  const membership = leaguesRepo.getMember(leagueId, userId);
  if (!membership) {
    throw createHttpError(
      403,
      "You are not a member of this league",
      "Forbidden"
    );
  }

  if (allowed === "owner-only") {
    const league = leaguesRepo.findById(leagueId);
    if (!league || league.owner_user_id !== userId) {
      throw createHttpError(403, "Owner permission required", "Forbidden");
    }
    return membership.role;
  }

  if (!allowed.includes(membership.role)) {
    throw createHttpError(403, "Insufficient permissions", "Forbidden");
  }

  return membership.role;
}

function mapLeagueSummaryWithMembership(
  league: LeagueSummary & { createdAt: string },
  userId: number | null
): LeagueDetail {
  const membership = userId ? leaguesRepo.getMember(league.id, userId) : null;

  return {
    id: league.id,
    name: league.name,
    description: league.description,
    logoUrl: league.logoUrl,
    visibility: league.visibility,
    ownerUserId: league.ownerUserId,
    ownerUsername: league.ownerUsername,
    memberCount: league.memberCount,
    activeSeasonCount: league.activeSeasonCount,
    createdAt: league.createdAt,
    isMember: Boolean(membership),
    myRole: membership ? membership.role : null
  };
}

function parseOptionalIsoDate(field: string, v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw createHttpError(400, `Invalid ${field} date`, "BadRequest", { field });
  }
  return d.toISOString();
}

export const leaguesService = {
  discoverLeagues(
    _user: AppUser | null,
    query: DiscoverLeaguesQuery
  ): BasePaginated<LeagueSummary> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const { limit: l, offset } = toLimitOffset({ page, limit });

    const { items, total } = leaguesRepo.listDiscover(
      query.search,
      query.visibility ?? "all",
      l,
      offset
    );

    return toPaginatedResult(items, total, { page, limit });
  },

  listMyLeagues(user: AppUser): LeagueSummary[] {
    return leaguesRepo.listForUser(user.id);
  },

  async createLeague(
    owner: AppUser,
    body: CreateLeagueBody
  ): Promise<LeagueDetail> {
    if (!body.name || !body.name.trim()) {
      throw createHttpError(400, "League name is required", "BadRequest", {
        field: "name"
      });
    }

    if (
      !["public", "private", "password-protected", "invite-only"].includes(
        body.visibility
      )
    ) {
      throw createHttpError(400, "Invalid visibility", "BadRequest", {
        field: "visibility"
      });
    }

    let passwordHash: string | null = null;
    if (body.visibility === "password-protected") {
      if (!body.password || !body.password.trim()) {
        throw createHttpError(
          400,
          "Password is required for password-protected leagues",
          "BadRequest",
          { field: "password" }
        );
      }
      passwordHash = await argon2.hash(body.password);
    }

    const leagueRow = leaguesRepo.createLeague(owner.id, {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
      visibility: body.visibility,
      passwordHash,
      sport: body.sport ?? null
    });

    // Owner automatically becomes league member with role 'owner'
    leaguesRepo.addMember(leagueRow.id, owner.id, "owner");

    const full = leaguesRepo.findByIdWithOwnerAndCounts(leagueRow.id);
    if (!full) {
      throw createHttpError(
        500,
        "Failed to load league after creation",
        "InternalServerError"
      );
    }

    return mapLeagueSummaryWithMembership(full, owner.id);
  },

  getLeagueDetail(leagueId: number, user: AppUser | null): LeagueDetail {
    const full = leaguesRepo.findByIdWithOwnerAndCounts(leagueId);
    if (!full) {
      throw createHttpError(404, "League not found", "NotFound");
    }

    return mapLeagueSummaryWithMembership(full, user ? user.id : null);
  },

  async updateLeague(
    leagueId: number,
    user: AppUser,
    body: UpdateLeagueBody
  ): Promise<LeagueDetail> {
    const league = ensureLeagueExists(leagueId);

    // Owner or commissioner can edit identity; owner-only for visibility/password
    const role = requireLeagueRole(leagueId, user.id, ["owner", "commissioner"]);

    let passwordHash: string | null | undefined = undefined;
    if (
      body.visibility &&
      !["public", "private", "password-protected", "invite-only"].includes(
        body.visibility
      )
    ) {
      throw createHttpError(400, "Invalid visibility", "BadRequest", {
        field: "visibility"
      });
    }

    if (body.password !== undefined || body.visibility === "password-protected") {
      // Only owner may change password/visibility
      if (role !== "owner" || league.owner_user_id !== user.id) {
        throw createHttpError(
          403,
          "Only the league owner can change password/visibility",
          "Forbidden"
        );
      }

      if (body.visibility === "password-protected") {
        if (!body.password || !body.password.trim()) {
          throw createHttpError(
            400,
            "Password is required for password-protected leagues",
            "BadRequest",
            { field: "password" }
          );
        }
        passwordHash = await argon2.hash(body.password);
      } else if (body.password === null || body.password === "") {
        // Clear password if switching away
        passwordHash = null;
      }
    }

    const updatedRow = leaguesRepo.updateLeague(leagueId, {
      name: body.name?.trim(),
      description: body.description?.trim() ?? body.description ?? undefined,
      logoUrl: body.logoUrl?.trim() ?? body.logoUrl ?? undefined,
      visibility: body.visibility,
      passwordHash
    });

    const full = leaguesRepo.findByIdWithOwnerAndCounts(updatedRow.id)!;
    return mapLeagueSummaryWithMembership(full, user.id);
  },

  deleteLeague(leagueId: number, user: AppUser): void {
    const league = ensureLeagueExists(leagueId);

    // Owner or superadmin can delete; superadmin enforcement is handled at route layer
    if (league.owner_user_id !== user.id && user.role !== "superadmin") {
      throw createHttpError(
        403,
        "Only the league owner or superadmin can delete this league",
        "Forbidden"
      );
    }

    leaguesRepo.deleteLeague(leagueId);
  },

  listMembers(leagueId: number, user: AppUser): LeagueMemberSummary[] {
    // Must be member to see full member list
    requireLeagueRole(leagueId, user.id, ["owner", "commissioner", "member"]);
    return leaguesRepo.listMembers(leagueId);
  },

  async joinLeague(
    leagueId: number,
    user: AppUser,
    body: JoinLeagueBody
  ): Promise<LeagueDetail> {
    const leagueRow = ensureLeagueExists(leagueId);

    const existing = leaguesRepo.getMember(leagueId, user.id);
    if (existing) {
      return this.getLeagueDetail(leagueId, user);
    }

    switch (leagueRow.visibility as LeagueVisibility) {
      case "public":
      case "private":
        // For now, treat "private" the same but it might use approval flows later.
        break;

      case "password-protected": {
        if (!leagueRow.password_hash) {
          throw createHttpError(
            500,
            "League password not configured correctly",
            "InternalServerError"
          );
        }
        if (!body.password) {
          throw createHttpError(
            400,
            "Password is required to join this league",
            "BadRequest",
            { field: "password" }
          );
        }
        const ok = await argon2.verify(leagueRow.password_hash, body.password);
        if (!ok) {
          throw createHttpError(
            401,
            "Incorrect league password",
            "Unauthorized",
            { field: "password" }
          );
        }
        break;
      }

      case "invite-only":
        // TODO: integrate with invites system.
        throw createHttpError(403, "This league is invite-only", "Forbidden");
    }

    leaguesRepo.addMember(leagueId, user.id, "member");
    const full = leaguesRepo.findByIdWithOwnerAndCounts(leagueId)!;
    return mapLeagueSummaryWithMembership(full, user.id);
  },

  leaveLeague(leagueId: number, user: AppUser): void {
    const league = ensureLeagueExists(leagueId);

    if (league.owner_user_id === user.id) {
      throw createHttpError(
        400,
        "Owner cannot leave their own league. Transfer ownership or delete league.",
        "BadRequest"
      );
    }

    const membership = leaguesRepo.getMember(leagueId, user.id);
    if (!membership) {
      // idempotent leave
      return;
    }

    leaguesRepo.removeMember(leagueId, user.id);
  },

  promoteMember(
    leagueId: number,
    actor: AppUser,
    targetUserId: number
  ): LeagueMemberSummary[] {
    const league = ensureLeagueExists(leagueId);

    if (league.owner_user_id !== actor.id) {
      throw createHttpError(
        403,
        "Only the league owner can promote members",
        "Forbidden"
      );
    }

    const targetMembership = leaguesRepo.getMember(leagueId, targetUserId);
    if (!targetMembership) {
      throw createHttpError(404, "Target user is not a member", "NotFound");
    }

    // Promote to commissioner
    leaguesRepo.updateMemberRole(leagueId, targetUserId, "commissioner");
    return leaguesRepo.listMembers(leagueId);
  },

  demoteMember(
    leagueId: number,
    actor: AppUser,
    targetUserId: number
  ): LeagueMemberSummary[] {
    const league = ensureLeagueExists(leagueId);

    if (league.owner_user_id !== actor.id) {
      throw createHttpError(
        403,
        "Only the league owner can demote members",
        "Forbidden"
      );
    }

    if (targetUserId === actor.id) {
      throw createHttpError(400, "Owner cannot demote themselves", "BadRequest");
    }

    const targetMembership = leaguesRepo.getMember(leagueId, targetUserId);
    if (!targetMembership) {
      throw createHttpError(404, "Target user is not a member", "NotFound");
    }

    leaguesRepo.updateMemberRole(leagueId, targetUserId, "member");
    return leaguesRepo.listMembers(leagueId);
  },

  kickMember(
    leagueId: number,
    actor: AppUser,
    targetUserId: number
  ): LeagueMemberSummary[] {
    const league = ensureLeagueExists(leagueId);

    const actorMembership = leaguesRepo.getMember(leagueId, actor.id);
    if (!actorMembership) {
      throw createHttpError(403, "You are not a member of this league", "Forbidden");
    }

    const targetMembership = leaguesRepo.getMember(leagueId, targetUserId);
    if (!targetMembership) {
      throw createHttpError(404, "Target user is not a member", "NotFound");
    }

    // Owner can kick anyone except themselves; commissioners can kick members only
    if (actor.id === league.owner_user_id) {
      if (targetUserId === league.owner_user_id) {
        throw createHttpError(400, "Owner cannot kick themselves", "BadRequest");
      }
    } else if (actorMembership.role === "commissioner") {
      if (targetMembership.role !== "member") {
        throw createHttpError(
          403,
          "Commissioners can only remove members",
          "Forbidden"
        );
      }
    } else {
      throw createHttpError(
        403,
        "Only owner or commissioners can remove members",
        "Forbidden"
      );
    }

    leaguesRepo.removeMember(leagueId, targetUserId);
    return leaguesRepo.listMembers(leagueId);
  },

  listSeasons(leagueId: number, _user: AppUser): LeagueSeasonSummary[] {
    ensureLeagueExists(leagueId);
    return leaguesRepo.listSeasonsForLeague(leagueId);
  },

  /**
   * ✅ Create season inside a league (owner/commissioner).
   * Used by POST /leagues/:leagueId/seasons
   */
  createSeason(
    leagueId: number,
    actor: AppUser,
    body: CreateSeasonBody
  ): LeagueSeasonSummary {
    ensureLeagueExists(leagueId);

    requireLeagueRole(leagueId, actor.id, ["owner", "commissioner"]);

    const name = body.name?.trim();
    if (!name) {
      throw createHttpError(400, "Season name is required", "BadRequest", {
        field: "name"
      });
    }

    const startsAt = parseOptionalIsoDate("startsAt", (body as any).startsAt) ?? null;
    const endsAt = parseOptionalIsoDate("endsAt", (body as any).endsAt) ?? null;

    if (startsAt && endsAt) {
      const s = new Date(startsAt).getTime();
      const e = new Date(endsAt).getTime();
      if (e < s) {
        throw createHttpError(400, "endsAt must be after startsAt", "BadRequest", {
          field: "endsAt"
        });
      }
    }

    const created = seasonsRepo.createSeason({
      leagueId,
      name,
      description: (body as any).description?.trim?.() ?? (body as any).description ?? null,
      status: (body as any).status ?? "draft",
      startsAt,
      endsAt
    });

    return {
      id: created.id,
      leagueId: created.leagueId,
      name: created.name,
      status: created.status,
      startsAt: created.startsAt,
      endsAt: created.endsAt,
      createdAt: created.createdAt
    };
  }
};
