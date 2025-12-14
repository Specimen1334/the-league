// apps/api/src/modules/teams/lineups.schemas.ts

/**
 * Body payload for setting a team's active lineup for a given round.
 * Per Backend Design:
 * - For each round/week: team selects a subset of pokemonInstanceIds.
 */
export type SetLineupBody = {
  /** League round / week number (1-based). */
  round: number;

  /**
   * Ordered list of pokemonInstanceIds that should be active.
   * Order is meaningful if you later want "slot 1, slot 2, ..." logic.
   */
  pokemonInstanceIds: number[];

  /**
   * Optional flag for future use (e.g. commissioners forcing a lineup).
   * Regular user flows can ignore this.
   */
  force?: boolean;
};

/**
 * Returned after setting a lineup. Used by Team Hub / Match Hub.
 */
export type SetLineupResponse = {
  lineupId: number;
  teamId: number;
  seasonId: number;
  round: number;

  status: "Draft" | "Locked" | "Expired";

  validation: {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  };

  /**
   * Final list of pokemonInstanceIds that ended up in the lineup.
   * (After any dedupe/validation trimming.)
   */
  pokemonInstanceIds: number[];
};
