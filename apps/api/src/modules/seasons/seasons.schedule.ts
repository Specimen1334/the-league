// apps/api/src/modules/seasons/seasons.schedule.ts
import type { AppUser } from "../../shared/types";
import { seasonsRepo } from "./seasons.repo";

/**
 * Options for generating a schedule.
 * You can extend this later with pools, groups, double round robin, etc.
 */
export type GenerateScheduleOptions = {
  /** Number of round-robin rounds; default depends on team count. */
  rounds?: number;
};

export type GeneratedScheduleSummary = {
  seasonId: number;
  matchCount: number;
  rounds: number;
};

export const seasonScheduleService = {
  /**
   * Stubbed schedule generator that just validates permissions and
   * returns a summary. Actual match row creation can be implemented
   * once matches.repo.ts is in place.
   */
  generateSchedule(
    seasonId: number,
    user: AppUser,
    options: GenerateScheduleOptions = {}
  ): GeneratedScheduleSummary {
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // Simple permission rule: only commissioners/superadmins can generate.
    if (user.role !== "commissioner" && user.role !== "superadmin") {
      const err = new Error("You do not have permission to generate this schedule");
      (err as any).statusCode = 403;
      throw err;
    }

    // For now we just return a dummy summary so the API shape is solid.
    const rounds = options.rounds ?? 1;
    const matchCount = 0; // will be computed once match rows are created

    return {
      seasonId: season.id,
      matchCount,
      rounds
    };
  }
};
