// apps/web/kit/drafts.ts

import { API_BASE, fetchJSON, postAction } from "./api";

export type DraftStatus = "NotStarted" | "Lobby" | "InProgress" | "Paused" | "Completed";
export type DraftType = "Snake" | "Linear" | "Custom";

export type DraftLobbyParticipant = {
  teamId: number;
  teamName: string;
  managerUserId: number;
  managerDisplayName: string | null;
  position: number;
  isReady: boolean;
  isYou: boolean;
};

export type DraftLobbyResponse = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;
  startsAt: string | null;
  pickTimerSeconds: number | null;
  roundCount: number | null;
  participants: DraftLobbyParticipant[];
};

export type DraftStatePick = {
  id: number;
  round: number;
  pickInRound: number;
  overallPickNumber: number;
  teamId: number;
  teamName: string | null;
  pokemonId: number;
  pokemonName: string | null;
  spriteUrl: string | null;
};

export type DraftStateResponse = {
  seasonId: number;
  status: DraftStatus;
  type: DraftType;
  currentRound: number;
  currentPickInRound: number;
  overallPickNumber: number;
  totalTeams: number;
  teamOnTheClock: { teamId: number; teamName: string } | null;
  timer: { pickTimerSeconds: number | null };
  picks: DraftStatePick[];
};

export type DraftPoolItem = {
  pokemonId: number;
  dexNumber: number | null;
  name: string;
  spriteUrl: string | null;
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  } | null;
  types: string[];
  roles: string[];
  baseCost: number | null;
  abilities: string[];
  moves: string[];
  isPicked: boolean;
  pickedByTeamId: number | null;
};

export type DraftPoolResponse = {
  seasonId: number;
  items: DraftPoolItem[];
  page: number;
  limit: number;
  total: number;
};

export type MyDraftResponse = {
  seasonId: number;
  teamId: number;
  teamName: string;
  picks: {
    round: number;
    pickInRound: number;
    overallPickNumber: number;
    pokemonId: number;
  }[];
  roster: Pick<
    DraftPoolItem,
    "pokemonId" | "dexNumber" | "name" | "spriteUrl" | "baseStats" | "types" | "roles" | "baseCost"
  >[];
  watchlistPokemonIds: number[];
};

export async function fetchLobby(seasonId: number): Promise<DraftLobbyResponse> {
  return fetchJSON<DraftLobbyResponse>(`${API_BASE}/seasons/${seasonId}/draft/lobby`);
}

export async function fetchState(seasonId: number): Promise<DraftStateResponse> {
  return fetchJSON<DraftStateResponse>(`${API_BASE}/seasons/${seasonId}/draft/state`);
}

export async function fetchMy(seasonId: number): Promise<MyDraftResponse> {
  return fetchJSON<MyDraftResponse>(`${API_BASE}/seasons/${seasonId}/draft/my`);
}

export async function fetchPool(seasonId: number, q: Record<string, any>): Promise<DraftPoolResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "boolean") {
      qs.set(k, v ? "true" : "false");
    } else {
      qs.set(k, String(v));
    }
  }
  const url = `${API_BASE}/seasons/${seasonId}/draft/pool${qs.toString() ? `?${qs.toString()}` : ""}`;
  return fetchJSON<DraftPoolResponse>(url);
}

export const toggleReadySvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/ready`);
export const makePickSvc = (seasonId: number, pokemonId: number) =>
  postAction(`/seasons/${seasonId}/draft/pick`, { pokemonId });
export const updateWatchlistSvc = (seasonId: number, pokemonIds: number[]) =>
  postAction(`/seasons/${seasonId}/draft/watchlist`, { pokemonIds });

// Admin actions
export const adminStartSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/start`);
export const adminPauseSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/pause`);
export const adminResumeSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/resume`);
export const adminEndSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/end`);
export const adminUndoLastSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/undo-last`);
export const adminAdvanceSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/advance`);
export const adminForcePickSvc = (seasonId: number, body: { pokemonId: number; teamId?: number }) =>
  postAction(`/seasons/${seasonId}/draft/admin/force-pick`, body);
export const adminRerollOrderSvc = (seasonId: number) => postAction(`/seasons/${seasonId}/draft/admin/reroll-order`);
export async function adminUpdateSettingsSvc(seasonId: number, body: any) {
  return fetchJSON<any>(`${API_BASE}/seasons/${seasonId}/draft/admin/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
