// apps/api/src/shared/permissions.ts
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppUser } from "./types";
import { createHttpError } from "./errors";
import type { LeagueMemberRole } from "../modules/leagues/leagues.schemas";
import { leaguesRepo } from "../modules/leagues/leagues.repo";

export type RequireAuthHook = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export type RequireSuperAdminHook = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export function createRequireAuthHook(): RequireAuthHook {
  return async (request, reply) => {
    if (!request.user) {
      const err = createHttpError(401, "Authentication required", "Unauthorized");
      reply.code(err.statusCode).send({
        error: err.error,
        message: err.message
      });
      return;
    }
  };
}

export function createRequireSuperAdminHook(): RequireSuperAdminHook {
  return async (request, reply) => {
    const user: AppUser | undefined = request.user;
    if (!user) {
      const err = createHttpError(401, "Authentication required", "Unauthorized");
      reply.code(err.statusCode).send({
        error: err.error,
        message: err.message
      });
      return;
    }
    if (user.role !== "superadmin") {
      const err = createHttpError(403, "Superadmin role required", "Forbidden");
      reply.code(err.statusCode).send({
        error: err.error,
        message: err.message
      });
      return;
    }
  };
}

/**
 * ---------------------------------------------------------------------------
 * Assertion helpers (service-friendly): throw HttpError on failure.
 *
 * IMPORTANT:
 * - Global roles are ONLY used for "superadmin".
 * - League authority MUST come from league_members (league-scoped roles).
 * ---------------------------------------------------------------------------
 */

export function assertAuthed(user: AppUser | undefined): AppUser {
  if (!user) throw createHttpError(401, "Authentication required", "Unauthorized");
  return user;
}

export function assertSuperAdmin(user: AppUser): void {
  if (user.role !== "superadmin") {
    throw createHttpError(403, "Superadmin role required", "Forbidden");
  }
}

export function getLeagueRoleOrNull(
  leagueId: number,
  userId: number
): LeagueMemberRole | null {
  const membership = leaguesRepo.getMember(leagueId, userId);
  return membership?.role ?? null;
}

export function assertLeagueMember(
  user: AppUser,
  leagueId: number
): LeagueMemberRole {
  if (user.role === "superadmin") return "owner";
  const role = getLeagueRoleOrNull(leagueId, user.id);
  if (!role) {
    throw createHttpError(403, "League membership required", "Forbidden", {
      leagueId
    });
  }
  return role;
}

export function assertLeagueRole(
  user: AppUser,
  leagueId: number,
  allowed: LeagueMemberRole[] | "owner-only"
): LeagueMemberRole {
  if (user.role === "superadmin") return "owner";

  const role = getLeagueRoleOrNull(leagueId, user.id);
  if (!role) {
    throw createHttpError(403, "League membership required", "Forbidden", {
      leagueId
    });
  }

  if (allowed === "owner-only") {
    if (role === "owner") return role;
    throw createHttpError(403, "Owner role required", "Forbidden", { leagueId });
  }

  if (!allowed.includes(role)) {
    throw createHttpError(403, "Insufficient league role", "Forbidden", {
      leagueId,
      required: allowed,
      actual: role
    });
  }

  return role;
}
