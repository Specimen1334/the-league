// apps/api/src/shared/types.ts

export type UserRole = "user" | "commissioner" | "superadmin";

export interface AppUser {
  id: number; // NOTE: currently INTEGER; can be migrated to string UUID later
  username: string;
  displayName: string | null;
  email: string | null;
  role: UserRole;
  createdAt: string;
}

// Fastify request augmentation
declare module "fastify" {
  interface FastifyRequest {
    user?: AppUser;
    sessionId?: string;
  }
}
