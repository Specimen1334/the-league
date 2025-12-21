// apps/api/src/modules/draft/draft.service.ts
import type { AppUser } from "../../shared/types";
import { seasonsRepo } from "../seasons/seasons.repo";
import { teamsRepo } from "../teams/teams.repo";
import { pokedexRepo } from "../pokedex/pokedex.repo";
import { draftRepo } from "./draft.repo";
import type { DraftSessionRow } from "./draft.repo";
import { getLeagueRoleOrNull, assertLeagueRole } from "../../shared/permissions";

import type {
  DraftLobbyResponse,
  DraftPoolQuery,
  DraftPoolResponse,
  DraftWatchlistBody,
  DraftWatchlistResponse,
  MyDraftResponse,
  DraftResultsResponse,
  DraftResultsTeam,
  DraftTeamResultsResponse,
  DraftExportFormat,
  AdminForcePickBody,
  AdminUpdateDraftSettingsBody,
  DraftStateResponse,
  DraftPickBody,
  DraftStatus,
  DraftType
} from "./draft.schemas";

/**
 * Utility: parse and validate IDs from params.
 */
function assertPositiveInt(name: string, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${name} must be a positive integer`);
    (err as any).statusCode = 400;
    throw err;
  }
  return n;
}

function normalisePoolQuery(
  raw: DraftPoolQuery
): Required<Pick<DraftPoolQuery, "page" | "limit">> &
  Omit<DraftPoolQuery, "page" | "limit"> {
  const page = Math.max(1, Number(raw.page) || 1);
  // Draft rooms frequently need large, client-side sortable lists.
  // Keep a hard upper bound to protect the server.
  const limit = Math.min(1000, Math.max(1, Number(raw.limit) || 50));
  return {
    ...raw,
    page,
    limit
  };
}

function safeParseBaseStats(
  json: string | null | undefined
): { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const hp = Number(obj.hp);
    const atk = Number(obj.atk);
    const def = Number(obj.def);
    const spa = Number(obj.spa);
    const spd = Number(obj.spd);
    const spe = Number(obj.spe);
    if ([hp, atk, def, spa, spd, spe].some((n) => !Number.isFinite(n))) return null;
    return { hp, atk, def, spa, spd, spe };
  } catch {
    return null;
  }
}

/**
 * Decide which team is on the clock, given:
 * - draft type (Snake / Linear)
 * - ordered participants
 * - number of picks already made
 */
function computeTeamOnClock(
  draftType: DraftType,
  participants: { teamId: number; position: number }[],
  picksMade: number
): {
  currentRound: number;
  currentPickInRound: number;
  overallPickNumber: number;
  teamId: number;
} {
  const teamCount = participants.length;
  if (teamCount === 0) {
    return {
      currentRound: 1,
      currentPickInRound: 1,
      overallPickNumber: 1,
      teamId: 0
    };
  }

  const overallPickNumber = picksMade + 1; // 1-based

  const roundIndex = Math.floor(picksMade / teamCount); // 0-based round
  const pickIndexInRound = picksMade % teamCount; // 0-based

  const currentRound = roundIndex + 1;
  let order: { teamId: number; position: number }[];

  if (draftType === "Snake" && roundIndex % 2 === 1) {
    order = [...participants].sort((a, b) => b.position - a.position);
  } else {
    order = [...participants].sort((a, b) => a.position - b.position);
  }

  const currentTeam = order[pickIndexInRound];

  return {
    currentRound,
    currentPickInRound: pickIndexInRound + 1,
    overallPickNumber,
    teamId: currentTeam.teamId
  };
}

export const draftService = {
  /**
   * GET /seasons/:seasonId/draft/lobby
   */
  getLobby(seasonIdParam: string, user: AppUser): DraftLobbyResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // Ensure we have a session row.
    const session = draftRepo.ensureSession(seasonId);

    // Ensure participants exist – one per team in this season.
    const teams = teamsRepo.listSeasonTeams(seasonId);
    const teamIds = teams.map((t) => t.id);
    const participants = draftRepo.ensureParticipants(seasonId, teamIds);

    const youTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);

    const participantViews = participants.map((p) => {
      const team = teams.find((t) => t.id === p.teamId);
      return {
        teamId: p.teamId,
        teamName: team?.name ?? `Team #${p.teamId}`,
        managerUserId: team?.userId ?? 0,
        managerDisplayName: null,
        position: p.position,
        isReady: !!p.isReady,
        isYou: youTeam ? youTeam.id === p.teamId : false
      };
    });

    return {
      seasonId,
      status: session.status,
      type: session.type,
      startsAt: session.startsAt,
      pickTimerSeconds: session.pickTimerSeconds,
      roundCount: session.roundCount,
      participants: participantViews
    };
  },

  /**
   * POST /seasons/:seasonId/draft/ready
   * Toggle ready for the current user's team.
   * Returns updated lobby.
   */
  toggleReady(seasonIdParam: string, user: AppUser): DraftLobbyResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    draftRepo.ensureSession(seasonId);

    const youTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!youTeam) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    // Ensure participants exist
    const teams = teamsRepo.listSeasonTeams(seasonId);
    const teamIds = teams.map((t) => t.id);
    draftRepo.ensureParticipants(seasonId, teamIds);

    const participants = draftRepo.listParticipants(seasonId);
    const yourRow = participants.find((p) => p.teamId === youTeam.id);
    const newReady = !(yourRow?.isReady ?? false);

    draftRepo.setParticipantReady(seasonId, youTeam.id, newReady);

    // Return updated lobby
    return this.getLobby(seasonIdParam, user);
  },

  /**
   * GET /seasons/:seasonId/draft/state
   */
  getState(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const session = draftRepo.ensureSession(seasonId);
    const teams = teamsRepo.listSeasonTeams(seasonId);
    const participants = draftRepo.ensureParticipants(
      seasonId,
      teams.map((t) => t.id)
    );
    const picks = draftRepo.listPicks(seasonId);

    const orderedParticipants = participants
      .map((p) => ({ teamId: p.teamId, position: p.position }))
      .sort((a, b) => a.position - b.position);

    let currentRound = 1;
    let currentPickInRound = 1;
    let overallPickNumber = picks.length + 1;
    let teamOnClockId: number | null = null;

    if (
      session.status === "InProgress" ||
      session.status === "Lobby" ||
      session.status === "NotStarted"
    ) {
      const state = computeTeamOnClock(session.type, orderedParticipants, picks.length);
      currentRound = state.currentRound;
      currentPickInRound = state.currentPickInRound;
      overallPickNumber = state.overallPickNumber;
      teamOnClockId = state.teamId;
    } else {
      // Paused or Completed – no active team on the clock.
      teamOnClockId = null;
      currentRound =
        Math.floor(picks.length / Math.max(1, participants.length)) + 1;
      currentPickInRound =
        picks.length === 0
          ? 1
          : ((picks.length - 1) % Math.max(1, participants.length)) + 1;
      overallPickNumber = picks.length + 1;
    }

    const teamNames = new Map<number, string | null>();
    for (const t of teams) teamNames.set(t.id, t.name);

    const teamOnTheClock =
      teamOnClockId && teamNames.has(teamOnClockId)
        ? {
            teamId: teamOnClockId,
            teamName: teamNames.get(teamOnClockId) ?? `Team #${teamOnClockId}`
          }
        : null;

    const pickViews = picks.map((p) => {
      const entry = pokedexRepo.getEntryById(p.pokemonId);
      return {
        id: p.id,
        round: p.round,
        pickInRound: p.pickInRound,
        overallPickNumber: p.overallPickNumber,
        teamId: p.teamId,
        teamName: teamNames.get(p.teamId) ?? null,
        pokemonId: p.pokemonId,
        pokemonName: entry?.name ?? null,
        spriteUrl: entry?.spriteUrl ?? null
      };
    });

    return {
      seasonId,
      status: session.status,
      type: session.type,
      currentRound,
      currentPickInRound,
      overallPickNumber,
      totalTeams: participants.length,
      teamOnTheClock: teamOnTheClock,
      timer: {
        pickTimerSeconds: session.pickTimerSeconds
      },
      picks: pickViews
    };
  },

  /**
   * GET /seasons/:seasonId/draft/pool
   */
  getPool(
    seasonIdParam: string,
    user: AppUser,
    rawQuery: DraftPoolQuery
  ): DraftPoolResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const query = normalisePoolQuery(rawQuery);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const picks = draftRepo.listPicks(seasonId);
    const pickedByPokemonId = new Map<number, number>();
    for (const p of picks) {
      if (!pickedByPokemonId.has(p.pokemonId)) {
        pickedByPokemonId.set(p.pokemonId, p.teamId);
      }
    }

    const { rows, total } = pokedexRepo.browseEntries({
      page: query.page,
      limit: query.limit,
      search: query.search,
      type: query.type,
      role: query.role,
      minCost: undefined,
      maxCost: undefined,
      draftableOnly: true,
      legality: "allowed",
      leagueId: season.leagueId ?? undefined,
      seasonId: seasonId,
      sortBy: "name"
    });

    const items = rows
      .map((row) => {
        const types = safeParseArray(row.types_json);
        const roles = safeParseArray(row.roles_json);

        const pokemonId = row.id;
        const pickedByTeamId = pickedByPokemonId.get(pokemonId) ?? null;
        const isPicked = pickedByTeamId !== null;

        if (query.onlyAvailable && isPicked) {
          return null;
        }

        return {
          pokemonId,
          dexNumber: typeof row.dex_number === "number" ? row.dex_number : null,
          name: row.name,
          spriteUrl: row.sprite_url ?? null,
          baseStats: safeParseBaseStats(row.base_stats_json),
          types,
          roles,
          baseCost: row.override_cost ?? row.base_cost ?? null,
          isPicked,
          pickedByTeamId
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      seasonId,
      items,
      page: query.page,
      limit: query.limit,
      total
    };
  },

  /**
   * GET /seasons/:seasonId/draft/my
   */
  getMyDraft(seasonIdParam: string, user: AppUser): MyDraftResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const youTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!youTeam) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    const picks = draftRepo
      .listPicks(seasonId)
      .filter((p) => p.teamId === youTeam.id)
      .sort((a, b) => a.overallPickNumber - b.overallPickNumber)
      .map((p) => ({
        round: p.round,
        pickInRound: p.pickInRound,
        overallPickNumber: p.overallPickNumber,
        pokemonId: p.pokemonId
      }));

    const roster = picks
      .map((p) => {
        const entry = pokedexRepo.getEntryById(p.pokemonId);
        if (!entry) return null;
        const ctx = pokedexRepo.getSeasonContext(
          entry.pokemonId,
          season.leagueId ?? undefined,
          seasonId
        );
        return {
          pokemonId: entry.pokemonId,
          dexNumber: entry.dexNumber ?? null,
          name: entry.name,
          spriteUrl: entry.spriteUrl ?? null,
          baseStats: entry.baseStats ?? null,
          types: entry.types ?? [],
          roles: entry.roles ?? [],
          baseCost: ctx?.effectiveCost ?? entry.baseCost ?? null
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const watchlistPokemonIds = draftRepo.listWatchlist(seasonId, youTeam.id);

    return {
      seasonId,
      teamId: youTeam.id,
      teamName: youTeam.name,
      picks,
      roster,
      watchlistPokemonIds
    };
  },

  /**
   * POST /seasons/:seasonId/draft/watchlist
   */
  updateWatchlist(
    seasonIdParam: string,
    user: AppUser,
    body: DraftWatchlistBody
  ): DraftWatchlistResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const youTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);
    if (!youTeam) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    if (!body || !Array.isArray(body.pokemonIds)) {
      const err = new Error("pokemonIds must be an array");
      (err as any).statusCode = 400;
      throw err;
    }

    const unique = Array.from(
      new Set(body.pokemonIds.map((x) => assertPositiveInt("pokemonId", x)))
    ).slice(0, 200);

    // Validate Pokémon existence (and avoid storing junk ids).
    for (const pid of unique) {
      const entry = pokedexRepo.getEntryById(pid);
      if (!entry) {
        const err = new Error(`Pokémon not found: ${pid}`);
        (err as any).statusCode = 404;
        throw err;
      }
    }

    draftRepo.replaceWatchlist(seasonId, youTeam.id, unique);

    return {
      seasonId,
      teamId: youTeam.id,
      pokemonIds: draftRepo.listWatchlist(seasonId, youTeam.id)
    };
  },

  /**
   * POST /seasons/:seasonId/draft/pick
   */
  makePick(seasonIdParam: string, user: AppUser, body: DraftPickBody): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const pokemonId = assertPositiveInt("pokemonId", body.pokemonId);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const teams = teamsRepo.listSeasonTeams(seasonId);
    draftRepo.ensureParticipants(
      seasonId,
      teams.map((t) => t.id)
    );

    const youTeam = teamsRepo.getTeamBySeasonAndUser(seasonId, user.id);

    const leagueRole =
      season.leagueId != null ? getLeagueRoleOrNull(season.leagueId, user.id) : null;
    const isCommissioner =
      user.role === "superadmin" || leagueRole === "owner" || leagueRole === "commissioner";

    if (!youTeam && !isCommissioner) {
      const err = new Error("You do not manage a team in this season");
      (err as any).statusCode = 403;
      throw err;
    }

    // Cache names for actionable error messages.
    const teamNameById = new Map<number, string>();
    for (const t of teams) teamNameById.set(t.id, t.name);

    // Ensure Pokémon exists and is not banned in this season context.
    const entry = pokedexRepo.getEntryById(pokemonId);
    if (!entry) {
      const err = new Error("Pokémon not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // Draftable by definition iff base_cost is present.
    if (entry.baseCost == null) {
      const err = new Error("This Pokémon is not draftable");
      (err as any).statusCode = 409;
      throw err;
    }

    const seasonCtx = pokedexRepo.getSeasonContext(
      pokemonId,
      season.leagueId ?? undefined,
      seasonId
    );
    if (seasonCtx && seasonCtx.isBanned) {
      const err = new Error("This Pokémon is banned for this season");
      (err as any).statusCode = 409;
      throw err;
    }

    // ✅ Draft integrity: do all turn + availability checks and the insert inside
    // a single transaction so multi-tab spam / races cannot create duplicates.
    draftRepo.transaction(() => {
      const session = draftRepo.ensureSession(seasonId);
      if (session.status !== "InProgress") {
        const err = new Error(
          session.status === "Paused" ? "Draft is paused" : "Draft is not currently in progress"
        );
        (err as any).statusCode = 409;
        throw err;
      }

      const participants = draftRepo.listParticipants(seasonId);
      const picks = draftRepo.listPicks(seasonId);

      if (picks.some((p) => p.pokemonId === pokemonId)) {
        const err = new Error("This Pokémon has already been drafted");
        (err as any).statusCode = 409;
        throw err;
      }

      const orderedParticipants = participants
        .map((p) => ({ teamId: p.teamId, position: p.position }))
        .sort((a, b) => a.position - b.position);

      const clock = computeTeamOnClock(session.type, orderedParticipants, picks.length);
      const expectedTeamId = clock.teamId;

      if (!isCommissioner) {
        if (!youTeam || youTeam.id !== expectedTeamId) {
          const expectedName = teamNameById.get(expectedTeamId) ?? `Team #${expectedTeamId}`;
          const err = new Error(`Not your turn to pick. Currently picking: ${expectedName}.`);
          (err as any).statusCode = 403;
          throw err;
        }
      }

      try {
        draftRepo.insertPick({
          seasonId,
          round: clock.currentRound,
          pickInRound: clock.currentPickInRound,
          overallPickNumber: clock.overallPickNumber,
          teamId: expectedTeamId,
          pokemonId
        });
      } catch (e: any) {
        // Unique indexes added in schema will throw if the pokemon/overall pick is duplicated.
        const msg = String(e?.message ?? "");
        if (msg.includes("idx_draft_picks_season_pokemon") || msg.includes("UNIQUE")) {
          const err = new Error("This Pokémon was just drafted by another team");
          (err as any).statusCode = 409;
          throw err;
        }
        throw e;
      }
    });

    // Return updated state.
    return this.getState(seasonIdParam, user);
  },

  /**
   * GET /seasons/:seasonId/draft/results
   * (and optionally filtered by team)
   */
  getResults(
    seasonIdParam: string,
    user: AppUser
  ): DraftResultsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const session = draftRepo.ensureSession(seasonId);
    const teams = teamsRepo.listSeasonTeams(seasonId);
    const participants = draftRepo.ensureParticipants(
      seasonId,
      teams.map((t) => t.id)
    );
    const picks = draftRepo.listPicks(seasonId);

    const picksByTeam = new Map<number, typeof picks>();
    for (const p of picks) {
      if (!picksByTeam.has(p.teamId)) picksByTeam.set(p.teamId, []);
      picksByTeam.get(p.teamId)!.push(p);
    }

    const positionByTeam = new Map<number, number>();
    for (const p of participants) positionByTeam.set(p.teamId, p.position);

    const teamNameById = new Map<number, string>();
    for (const t of teams) teamNameById.set(t.id, t.name);

    const buildTeam = (teamId: number): DraftResultsTeam => {
      const picksForTeam = (picksByTeam.get(teamId) ?? [])
        .slice()
        .sort((a, b) => a.overallPickNumber - b.overallPickNumber);

      return {
        teamId,
        teamName: teamNameById.get(teamId) ?? `Team #${teamId}`,
        position: positionByTeam.get(teamId) ?? 0,
        picks: picksForTeam.map((p) => ({
          round: p.round,
          pickInRound: p.pickInRound,
          overallPickNumber: p.overallPickNumber,
          pokemonId: p.pokemonId
        }))
      };
    };

    const teamsResult: DraftResultsTeam[] = teams
      .map((t) => buildTeam(t.id))
      .sort((a, b) => a.position - b.position);

    return {
      seasonId,
      type: session.type,
      status: session.status,
      teams: teamsResult
    };
  },

  /**
   * GET /seasons/:seasonId/draft/results/:teamId
   */
  getTeamResults(
    seasonIdParam: string,
    teamIdParam: string,
    user: AppUser
  ): DraftTeamResultsResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    const teamId = assertPositiveInt("teamId", teamIdParam);

    const results = this.getResults(seasonIdParam, user);
    const team = results.teams.find((t) => t.teamId === teamId);
    if (!team) {
      const err = new Error("Team not found in this season");
      (err as any).statusCode = 404;
      throw err;
    }
    return { seasonId, team };
  },

  /**
   * GET /seasons/:seasonId/draft/results/export/:format
   */
  exportDraftResults(
    seasonIdParam: string,
    user: AppUser,
    format: DraftExportFormat
  ): string {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const results = this.getResults(seasonIdParam, user);

    // Map pokemonId -> name for readability
    const nameCache = new Map<number, string>();
    const getName = (pokemonId: number) => {
      if (nameCache.has(pokemonId)) return nameCache.get(pokemonId)!;
      const entry = pokedexRepo.getEntryById(pokemonId);
      const name = entry?.name ?? `Pokemon#${pokemonId}`;
      nameCache.set(pokemonId, name);
      return name;
    };

    if (format === "csv") {
      const lines: string[] = [];
      lines.push(
        [
          "seasonId",
          "teamId",
          "teamName",
          "position",
          "round",
          "pickInRound",
          "overallPickNumber",
          "pokemonId",
          "pokemonName"
        ].join(",")
      );

      for (const team of results.teams) {
        for (const pick of team.picks) {
          const row = [
            results.seasonId,
            team.teamId,
            csvEscape(team.teamName),
            team.position,
            pick.round,
            pick.pickInRound,
            pick.overallPickNumber,
            pick.pokemonId,
            csvEscape(getName(pick.pokemonId))
          ];
          lines.push(row.join(","));
        }
      }
      return lines.join("\n");
    }

    // showdown-ish: readable import blocks (species only)
    const blocks: string[] = [];
    for (const team of results.teams) {
      blocks.push(`=== ${team.teamName} ===`);
      for (const pick of team.picks) {
        blocks.push(getName(pick.pokemonId));
      }
      blocks.push("");
    }
    return blocks.join("\n").trimEnd();
  },

  /**
   * Admin controls – start/pause/resume/undo/advance
   */
  
  adminRerollOrder(seasonIdParam: string, user: AppUser): DraftLobbyResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const session = draftRepo.ensureSession(seasonId);
    if (session.status !== "NotStarted" && session.status !== "Lobby") {
      const err = new Error("Draft order can only be rerolled before the draft starts");
      (err as any).statusCode = 409;
      throw err;
    }

    const picks = draftRepo.listPicks(seasonId);
    if (picks.length > 0) {
      const err = new Error("Cannot reroll draft order after picks have been made");
      (err as any).statusCode = 409;
      throw err;
    }

    const teams = teamsRepo.listSeasonTeams(seasonId);
    const participants = draftRepo.ensureParticipants(
      seasonId,
      teams.map((t) => t.id)
    );

    // Fisher–Yates shuffle of teamIds
    const shuffled = participants.map((p) => p.teamId);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    draftRepo.setParticipantPositions(
      seasonId,
      shuffled.map((teamId, idx) => ({ teamId, position: idx + 1 }))
    );

    return this.getLobby(seasonIdParam, user);
  },

  adminUpdateDraftSettings(
    seasonIdParam: string,
    user: AppUser,
    body: AdminUpdateDraftSettingsBody
  ): DraftLobbyResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const session = draftRepo.ensureSession(seasonId);
    if (session.status !== "NotStarted" && session.status !== "Lobby") {
      const err = new Error("Draft settings can only be changed before the draft starts");
      (err as any).statusCode = 409;
      throw err;
    }

    const picks = draftRepo.listPicks(seasonId);
    if (picks.length > 0) {
      const err = new Error("Draft settings cannot be changed after picks have been made");
      (err as any).statusCode = 409;
      throw err;
    }

    const patch: Partial<Pick<DraftSessionRow, "type" | "startsAt" | "pickTimerSeconds" | "roundCount">> = {};

    if (body?.type !== undefined) {
      if (body.type !== "Snake" && body.type !== "Linear" && body.type !== "Custom") {
        const err = new Error("Invalid draft type");
        (err as any).statusCode = 400;
        throw err;
      }
      patch.type = body.type;
    }

    if (body?.startsAt !== undefined) {
      if (body.startsAt !== null) {
        const d = new Date(body.startsAt);
        if (Number.isNaN(d.getTime())) {
          const err = new Error("startsAt must be a valid ISO 8601 date-time or null");
          (err as any).statusCode = 400;
          throw err;
        }
      }
      patch.startsAt = body.startsAt ?? null;
    }

    if (body?.pickTimerSeconds !== undefined) {
      if (body.pickTimerSeconds !== null) {
        const n = Number(body.pickTimerSeconds);
        if (!Number.isInteger(n) || n < 5 || n > 3600) {
          const err = new Error("pickTimerSeconds must be an integer between 5 and 3600, or null");
          (err as any).statusCode = 400;
          throw err;
        }
        patch.pickTimerSeconds = n;
      } else {
        patch.pickTimerSeconds = null;
      }
    }

    if (body?.roundCount !== undefined) {
      if (body.roundCount !== null) {
        const n = Number(body.roundCount);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
          const err = new Error("roundCount must be an integer between 1 and 50, or null");
          (err as any).statusCode = 400;
          throw err;
        }
        patch.roundCount = n;
      } else {
        patch.roundCount = null;
      }
    }

    const updated = draftRepo.updateSession(seasonId, patch);
    if (!updated) {
      const err = new Error("Draft session not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // Keep season-scoped settings in sync where they overlap.
    const seasonSettingsPatch: any = {};
    if (patch.pickTimerSeconds !== undefined && patch.pickTimerSeconds !== null) {
      seasonSettingsPatch.pickTimerSeconds = patch.pickTimerSeconds;
    }
    if (patch.roundCount !== undefined && patch.roundCount !== null) {
      seasonSettingsPatch.roundCount = patch.roundCount;
    }
    if (patch.type !== undefined && (patch.type === "Snake" || patch.type === "Linear")) {
      seasonSettingsPatch.draftType = patch.type;
    }
    if (Object.keys(seasonSettingsPatch).length > 0) {
      seasonsRepo.updateSeasonSettings(seasonId, seasonSettingsPatch);
    }

    return this.getLobby(seasonIdParam, user);
  },

  adminStartDraft(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const session = draftRepo.ensureSession(seasonId);
    if (session.status !== "NotStarted" && session.status !== "Lobby") {
      const err = new Error("Draft cannot be started from the current state");
      (err as any).statusCode = 409;
      throw err;
    }

    // Ensure participant list exists before starting.
    const teams = teamsRepo.listSeasonTeams(seasonId);
    draftRepo.ensureParticipants(seasonId, teams.map((t) => t.id));

    // Season lifecycle: Signup → Drafting when the draft starts.
    if (season.status === "Signup") {
      seasonsRepo.updateSeason(seasonId, { status: "Drafting" });
    }

    draftRepo.updateSession(seasonId, { status: "InProgress" as DraftStatus });
    return this.getState(seasonIdParam, user);
  },

  adminPauseDraft(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    draftRepo.ensureSession(seasonId);
    draftRepo.updateSession(seasonId, { status: "Paused" as DraftStatus });
    return this.getState(seasonIdParam, user);
  },

  adminResumeDraft(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const session = draftRepo.ensureSession(seasonId);
    if (session.status !== "Paused") {
      const err = new Error("Draft is not paused");
      (err as any).statusCode = 409;
      throw err;
    }

    draftRepo.updateSession(seasonId, { status: "InProgress" as DraftStatus });
    return this.getState(seasonIdParam, user);
  },

  adminEndDraft(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const session = draftRepo.ensureSession(seasonId);
    if (session.status === "Completed") {
      return this.getState(seasonIdParam, user);
    }

    draftRepo.updateSession(seasonId, { status: "Completed" as DraftStatus });

    // Season lifecycle: Drafting → Active when the draft completes.
    if (season.status === "Drafting" || season.status === "Signup") {
      seasonsRepo.updateSeason(seasonId, { status: "Active" });
    }
    return this.getState(seasonIdParam, user);
  },

  adminUndoLast(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const last = draftRepo.getLastPick(seasonId);
    if (!last) {
      const err = new Error("No picks to undo");
      (err as any).statusCode = 409;
      throw err;
    }
    draftRepo.deletePickById(last.id);
    return this.getState(seasonIdParam, user);
  },

  adminForcePick(
    seasonIdParam: string,
    user: AppUser,
    body: AdminForcePickBody
  ): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    // Do the full turn + availability check inside a transaction.

    const pokemonId = assertPositiveInt("pokemonId", body?.pokemonId);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    // Validate pokemon outside tx (cheap), but recheck "already drafted" inside tx.
    const entry = pokedexRepo.getEntryById(pokemonId);
    if (!entry) {
      const err = new Error("Pokémon not found");
      (err as any).statusCode = 404;
      throw err;
    }
    const seasonCtx = pokedexRepo.getSeasonContext(
      pokemonId,
      season.leagueId ?? undefined,
      seasonId
    );
    if (seasonCtx && seasonCtx.isBanned) {
      const err = new Error("This Pokémon is banned for this season");
      (err as any).statusCode = 409;
      throw err;
    }

    draftRepo.transaction(() => {
      const session = draftRepo.ensureSession(seasonId);
      if (session.status !== "InProgress") {
        const err = new Error(
          session.status === "Paused" ? "Draft is paused" : "Draft is not currently in progress"
        );
        (err as any).statusCode = 409;
        throw err;
      }

      const teams = teamsRepo.listSeasonTeams(seasonId);
      draftRepo.ensureParticipants(seasonId, teams.map((t) => t.id));

      const participants = draftRepo.listParticipants(seasonId);
      const picks = draftRepo.listPicks(seasonId);

      const orderedParticipants = participants
        .map((p) => ({ teamId: p.teamId, position: p.position }))
        .sort((a, b) => a.position - b.position);
      const clock = computeTeamOnClock(session.type, orderedParticipants, picks.length);
      const expectedTeamId = clock.teamId;

      if (body?.teamId != null) {
        const forcedTeamId = assertPositiveInt("teamId", body.teamId);
        if (forcedTeamId !== expectedTeamId) {
          const err = new Error("teamId does not match the team currently on the clock");
          (err as any).statusCode = 409;
          throw err;
        }
      }

      if (picks.some((p) => p.pokemonId === pokemonId)) {
        const err = new Error("This Pokémon has already been drafted");
        (err as any).statusCode = 409;
        throw err;
      }

      try {
        draftRepo.insertPick({
        seasonId,
        round: clock.currentRound,
        pickInRound: clock.currentPickInRound,
        overallPickNumber: clock.overallPickNumber,
        teamId: expectedTeamId,
        pokemonId
        });
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("idx_draft_picks_season_pokemon") || msg.includes("UNIQUE")) {
          const err = new Error("This Pokémon was just drafted by another team");
          (err as any).statusCode = 409;
          throw err;
        }
        throw e;
      }
    });

    return this.getState(seasonIdParam, user);
  },

  /**
   * Advances the draft by auto-picking a valid Pokémon for the team on the clock.
   * This is production-safe for stalled drafts and commissioner intervention.
   */
  adminAdvanceDraft(seasonIdParam: string, user: AppUser): DraftStateResponse {
    const seasonId = assertPositiveInt("seasonId", seasonIdParam);
    this.assertCommissionerForSeason(seasonId, user);

    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }

    draftRepo.transaction(() => {
      const session = draftRepo.ensureSession(seasonId);
      if (session.status !== "InProgress") {
        const err = new Error(
          session.status === "Paused" ? "Draft is paused" : "Draft is not currently in progress"
        );
        (err as any).statusCode = 409;
        throw err;
      }

      const teams = teamsRepo.listSeasonTeams(seasonId);
      const participants = draftRepo.ensureParticipants(
        seasonId,
        teams.map((t) => t.id)
      );

      const picks = draftRepo.listPicks(seasonId);
      const picked = new Set<number>(picks.map((p) => p.pokemonId));

      const orderedParticipants = participants
        .map((p) => ({ teamId: p.teamId, position: p.position }))
        .sort((a, b) => a.position - b.position);
      const clock = computeTeamOnClock(session.type, orderedParticipants, picks.length);
      const expectedTeamId = clock.teamId;

      // Find the first available, not-banned Pokémon.
      let chosenPokemonId: number | null = null;
      const maxPagesToScan = 20;
      const pageSize = 100;

      for (let page = 1; page <= maxPagesToScan && chosenPokemonId == null; page++) {
        const { rows } = pokedexRepo.browseEntries({
          page,
          limit: pageSize,
          search: undefined,
          type: undefined,
          role: undefined,
          minCost: undefined,
          maxCost: undefined,
          leagueId: season.leagueId ?? undefined,
          seasonId: seasonId,
          sortBy: "name"
        });

        for (const row of rows) {
          const pid = row.id;
          if (picked.has(pid)) continue;
          const seasonCtx = pokedexRepo.getSeasonContext(
            pid,
            season.leagueId ?? undefined,
            seasonId
          );
          if (seasonCtx && seasonCtx.isBanned) continue;
          chosenPokemonId = pid;
          break;
        }
      }

      if (chosenPokemonId == null) {
        const err = new Error("No available Pokémon remain to auto-pick");
        (err as any).statusCode = 409;
        throw err;
      }

      try {
        draftRepo.insertPick({
          seasonId,
          round: clock.currentRound,
          pickInRound: clock.currentPickInRound,
          overallPickNumber: clock.overallPickNumber,
          teamId: expectedTeamId,
          pokemonId: chosenPokemonId
        });
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("idx_draft_picks_season_pokemon") || msg.includes("UNIQUE")) {
          const err = new Error("That Pokémon was just drafted by another team");
          (err as any).statusCode = 409;
          throw err;
        }
        throw e;
      }
    });

    return this.getState(seasonIdParam, user);
  },

  assertCommissionerForSeason(seasonId: number, user: AppUser) {
    const season = seasonsRepo.getSeasonById(seasonId);
    if (!season) {
      const err = new Error("Season not found");
      (err as any).statusCode = 404;
      throw err;
    }
    if (user.role === "superadmin") return;
    if (season.leagueId == null) {
      const err = new Error("Season is not associated with a league");
      (err as any).statusCode = 500;
      throw err;
    }
    assertLeagueRole(user, season.leagueId, ["owner", "commissioner"]);
  }
};

/**
 * Small JSON helper copied from Pokédex service.
 */
function safeParseArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
