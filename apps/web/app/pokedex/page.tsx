"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type HttpErrorWithStatus = Error & { status?: number };

// -----------------------------
// Types – aligned with design docs
// -----------------------------

type Legality = "Allowed" | "Banned" | "Restricted" | string;

type PokedexSummaryEntry = {
  pokemonId: number;
  name: string;
  types: string[];
  spriteUrl?: string | null;
  tierLabel?: string | null;
  globalCost?: number | null;
  seasonCost?: number | null;
  globalLegality?: Legality | null;
  seasonLegality?: Legality | null;
  bst?: number | null;
  roles?: string[];
  usagePercent?: number | null;
  banVotesFor?: number | null;
  banVotesAgainst?: number | null;
  costVoteCenter?: number | null;
};

type BaseStats = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

type PokedexDetailEntry = PokedexSummaryEntry & {
  baseStats?: BaseStats | null;
  primaryAbility?: string | null;
  secondaryAbilities?: string[] | null;
  hiddenAbility?: string | null;
  shortDescription?: string | null;
};

type PokedexSortOrder =
  | "name"
  | "cost_high"
  | "cost_low"
  | "bst_high"
  | "usage";

type LegalityFilter = "all" | "allowed" | "banned" | "restricted";

// -----------------------------
// Fetch helper
// -----------------------------

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init && init.headers)
    }
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore parse errors (204 etc.)
  }

  if (!res.ok) {
    const message =
      data?.error || data?.message || `Request failed with status ${res.status}`;
    const err = new Error(message) as HttpErrorWithStatus;
    err.status = res.status;
    throw err;
  }

  return data as T;
}

// -----------------------------
// Mapping helpers (snake/camel tolerant)
// -----------------------------

function mapSummaryList(raw: any): PokedexSummaryEntry[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.results ?? [];
  return (items as any[]).map(mapSummaryEntry);
}

function mapSummaryEntry(raw: any): PokedexSummaryEntry {
  const stats =
    raw.baseStats ??
    raw.base_stats ??
    raw.stats ??
    null;

  const bst =
    typeof raw.bst === "number"
      ? raw.bst
      : stats
      ? (stats.hp ?? 0) +
        (stats.atk ?? stats.attack ?? 0) +
        (stats.def ?? stats.defense ?? 0) +
        (stats.spa ?? stats.sp_atk ?? stats.spAtk ?? 0) +
        (stats.spd ?? stats.sp_def ?? stats.spDef ?? 0) +
        (stats.spe ?? stats.speed ?? 0)
      : null;

  const types: string[] =
    Array.isArray(raw.types) && raw.types.length
      ? raw.types
      : [raw.primaryType ?? raw.type1 ?? "Unknown"].filter(Boolean);

  const roles: string[] =
    Array.isArray(raw.roles) && raw.roles.length
      ? raw.roles
      : Array.isArray(raw.tags) && raw.tags.length
      ? raw.tags
      : [];

  return {
    pokemonId: raw.pokemonId ?? raw.id ?? raw.pokedexId ?? raw.pokedex_id,
    name: raw.name ?? raw.speciesName ?? raw.species_name ?? "Unknown",
    types,
    spriteUrl: raw.spriteUrl ?? raw.sprite_url ?? raw.iconUrl ?? null,
    tierLabel: raw.tierLabel ?? raw.tier_label ?? raw.tier ?? null,
    globalCost:
      typeof raw.globalCost === "number"
        ? raw.globalCost
        : typeof raw.baseCost === "number"
        ? raw.baseCost
        : typeof raw.base_cost === "number"
        ? raw.base_cost
        : null,
    seasonCost:
      typeof raw.seasonCost === "number"
        ? raw.seasonCost
        : typeof raw.season_cost === "number"
        ? raw.season_cost
        : null,
    globalLegality:
      raw.globalLegality ??
      raw.global_legality ??
      raw.legality ??
      null,
    seasonLegality:
      raw.seasonLegality ??
      raw.season_legality ??
      raw.seasonStatus ??
      null,
    bst,
    roles,
    usagePercent:
      typeof raw.usagePercent === "number"
        ? raw.usagePercent
        : typeof raw.usage_percent === "number"
        ? raw.usage_percent
        : null,
    banVotesFor:
      typeof raw.banVotesFor === "number"
        ? raw.banVotesFor
        : typeof raw.ban_votes_for === "number"
        ? raw.ban_votes_for
        : typeof raw.banVotes === "number"
        ? raw.banVotes
        : null,
    banVotesAgainst:
      typeof raw.banVotesAgainst === "number"
        ? raw.banVotesAgainst
        : typeof raw.ban_votes_against === "number"
        ? raw.ban_votes_against
        : typeof raw.keepVotes === "number"
        ? raw.keepVotes
        : null,
    costVoteCenter:
      typeof raw.costVoteCenter === "number"
        ? raw.costVoteCenter
        : typeof raw.cost_vote_center === "number"
        ? raw.cost_vote_center
        : null
  };
}

function mapDetail(raw: any): PokedexDetailEntry {
  const base = mapSummaryEntry(raw);
  const stats =
    raw.baseStats ??
    raw.base_stats ??
    raw.stats ??
    null;

  const baseStats: BaseStats | null = stats
    ? {
        hp: stats.hp ?? stats.HP ?? 0,
        atk: stats.atk ?? stats.attack ?? stats.ATK ?? 0,
        def: stats.def ?? stats.defense ?? stats.DEF ?? 0,
        spa:
          stats.spa ??
          stats.sp_atk ??
          stats.spAtk ??
          stats.SpA ??
          0,
        spd:
          stats.spd ??
          stats.sp_def ??
          stats.spDef ??
          stats.SpD ??
          0,
        spe: stats.spe ?? stats.speed ?? stats.SPE ?? 0
      }
    : null;

  const abilitiesRaw =
    raw.abilities ??
    raw.abilityList ??
    raw.ability_list ??
    null;

  let primaryAbility: string | null = null;
  let secondaryAbilities: string[] | null = null;
  let hiddenAbility: string | null = null;

  if (Array.isArray(abilitiesRaw)) {
    const names = abilitiesRaw.map((a: any) => {
      if (typeof a === "string") return a;
      return a.name ?? a.abilityName ?? a.ability_name ?? "";
    });
    if (names.length) {
      primaryAbility = names[0] || null;
      if (names.length > 1) secondaryAbilities = names.slice(1);
    }
  } else if (abilitiesRaw && typeof abilitiesRaw === "object") {
    primaryAbility =
      abilitiesRaw.primary ??
      abilitiesRaw.main ??
      abilitiesRaw.primaryAbility ??
      null;
    secondaryAbilities =
      abilitiesRaw.secondary ??
      abilitiesRaw.other ??
      abilitiesRaw.secondaryAbilities ??
      null;
    hiddenAbility =
      abilitiesRaw.hidden ??
      abilitiesRaw.hiddenAbility ??
      abilitiesRaw.hidden_ability ??
      null;
  }

  const shortDescription =
    raw.shortDescription ??
    raw.short_description ??
    raw.flavour ??
    raw.flavor ??
    null;

  return {
    ...base,
    baseStats,
    primaryAbility,
    secondaryAbilities: secondaryAbilities ?? null,
    hiddenAbility,
    shortDescription
  };
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

// -----------------------------
// Page component
// -----------------------------

export default function PokedexPage() {
  const [entries, setEntries] = useState<PokedexSummaryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] =
    useState<PokedexDetailEntry | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [legalityFilter, setLegalityFilter] =
    useState<LegalityFilter>("all");
  const [sortOrder, setSortOrder] =
    useState<PokedexSortOrder>("name");

  const [leagueId, setLeagueId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>("");

  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [banVoteBusyId, setBanVoteBusyId] = useState<number | null>(null);
  const [costVoteBusyId, setCostVoteBusyId] = useState<number | null>(
    null
  );
  const [costVoteTarget, setCostVoteTarget] = useState<string>("");

  // -----------------------------
  // Load list whenever filters change
  // -----------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoadingList(true);
      setListError(null);
      setGlobalError(null);

      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (legalityFilter !== "all") {
        params.set("legality", legalityFilter);
      }
      if (sortOrder) params.set("sort", sortOrder);
      if (leagueId.trim()) params.set("leagueId", leagueId.trim());
      if (seasonId.trim()) params.set("seasonId", seasonId.trim());

      const queryString = params.toString();
      const path = queryString ? `/pokedex?${queryString}` : "/pokedex";

      try {
        const raw = await fetchJson<any>(path);
        if (cancelled) return;
        const mapped = mapSummaryList(raw);
        setEntries(mapped);

        // If nothing selected or selected no longer in list, select first.
        if (
          mapped.length > 0 &&
          (selectedId == null ||
            !mapped.some((e) => e.pokemonId === selectedId))
        ) {
          setSelectedId(mapped[0].pokemonId);
        }
      } catch (err: any) {
        if (cancelled) return;
        setListError(err?.message ?? "Failed to load Pokedex entries.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    loadList();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search,
    typeFilter,
    roleFilter,
    legalityFilter,
    sortOrder,
    leagueId,
    seasonId
  ]);

  // -----------------------------
  // Load detail when selectedId changes
  // -----------------------------

  useEffect(() => {
    if (selectedId == null) {
      setSelectedDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setLoadingDetail(true);
      setDetailError(null);
      setGlobalError(null);
      try {
        const raw = await fetchJson<any>(
          `/pokedex/${selectedId}`
        );
        if (cancelled) return;
        setSelectedDetail(mapDetail(raw));

        // Pre-fill cost vote target with season cost or global cost
        const baseCost =
          raw.seasonCost ??
          raw.season_cost ??
          raw.globalCost ??
          raw.global_cost ??
          raw.baseCost ??
          raw.base_cost ??
          null;
        if (baseCost != null) {
          setCostVoteTarget(String(baseCost));
        }
      } catch (err: any) {
        if (cancelled) return;
        setDetailError(
          err?.message ?? "Failed to load Pokedex detail."
        );
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // -----------------------------
  // Actions – voting
  // -----------------------------

  async function castBanVote(entry: PokedexSummaryEntry) {
    setBanVoteBusyId(entry.pokemonId);
    setGlobalError(null);
    try {
      await fetchJson<unknown>(
        `/pokedex/${entry.pokemonId}/votes/ban`,
        {
          method: "POST",
          body: JSON.stringify({})
        }
      );

      // Reload list & detail to reflect updated vote counts
      const [rawList, rawDetail] = await Promise.all([
        fetchJson<any>("/pokedex"),
        fetchJson<any>(`/pokedex/${entry.pokemonId}`)
      ]);
      setEntries(mapSummaryList(rawList));
      setSelectedDetail(mapDetail(rawDetail));
    } catch (err: any) {
      setGlobalError(err?.message ?? "Failed to submit ban vote.");
    } finally {
      setBanVoteBusyId(null);
    }
  }

  async function castCostVote(entry: PokedexSummaryEntry) {
    if (!costVoteTarget.trim()) {
      setGlobalError("Please enter a target cost before voting.");
      return;
    }
    const target = Number(costVoteTarget);
    if (!Number.isFinite(target)) {
      setGlobalError("Target cost must be a number.");
      return;
    }

    setCostVoteBusyId(entry.pokemonId);
    setGlobalError(null);
    try {
      await fetchJson<unknown>(
        `/pokedex/${entry.pokemonId}/votes/cost`,
        {
          method: "POST",
          body: JSON.stringify({ targetCost: target })
        }
      );

      const [rawList, rawDetail] = await Promise.all([
        fetchJson<any>("/pokedex"),
        fetchJson<any>(`/pokedex/${entry.pokemonId}`)
      ]);
      setEntries(mapSummaryList(rawList));
      setSelectedDetail(mapDetail(rawDetail));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to submit cost adjustment vote."
      );
    } finally {
      setCostVoteBusyId(null);
    }
  }

  // -----------------------------
  // Derived lists / current selection
  // -----------------------------

  const hasAny = entries.length > 0;
  const selectedSummary = useMemo(
    () =>
      selectedId != null
        ? entries.find((e) => e.pokemonId === selectedId) ?? null
        : null,
    [entries, selectedId]
  );

  const combinedSelected: PokedexDetailEntry | null =
    selectedDetail ??
    (selectedSummary
      ? {
          ...selectedSummary,
          baseStats: null,
          primaryAbility: null,
          secondaryAbilities: null,
          hiddenAbility: null,
          shortDescription: null
        }
      : null);

  const listBusy =
    loadingList && entries.length === 0;

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="pokedex-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/dashboard" className="link">
              Dashboard
            </Link>{" "}
            /{" "}
            <span className="breadcrumb-current">Pokedex</span>
          </p>
          <h1 className="page-title">Pokedex / Player Browser</h1>
          <p className="page-subtitle">
            Search, filter, and inspect the full player pool, including season
            legality and draft costs.
          </p>
        </div>

        <div className="page-header-actions">
          {/* Season context panel (simple numeric IDs for now) */}
          <div className="card card-subtle pokedex-context-card">
            <div className="card-body">
              <div className="stack stack-xs">
                <span className="text-muted text-xs">
                  Season context (optional)
                </span>
                <div className="field-row field-row--dense">
                  <div className="field">
                    <label className="field-label text-xs">
                      League ID
                    </label>
                    <input
                      className="input input-xs"
                      value={leagueId}
                      onChange={(e) => setLeagueId(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div className="field">
                    <label className="field-label text-xs">
                      Season ID
                    </label>
                    <input
                      className="input input-xs"
                      value={seasonId}
                      onChange={(e) => setSeasonId(e.target.value)}
                      placeholder="e.g. 3"
                    />
                  </div>
                </div>
                <span className="text-muted text-xxs">
                  When set, cost and legality reflect this season&apos;s
                  overrides.
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {globalError && <div className="form-error">{globalError}</div>}
      {listError && <div className="form-error">{listError}</div>}
      {detailError && <div className="form-error">{detailError}</div>}

      <div className="layout-two-column pokedex-layout mt-md">
        {/* LEFT: Filter + list */}
        <section className="card pokedex-list-card">
          <div className="card-header">
            <h2 className="card-title">Browse Pokémon</h2>
            <p className="card-subtitle">
              Filter by type, role, legality, and cost. Click a row to see the
              detail panel.
            </p>
          </div>
          <div className="card-body">
            <div className="stack stack-sm mb-sm">
              <div className="field-row">
                <div className="field">
                  <label
                    className="field-label sr-only"
                    htmlFor="pokedex-search"
                  >
                    Search
                  </label>
                  <input
                    id="pokedex-search"
                    className="input input-sm"
                    placeholder="Search by name or species…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label
                    className="field-label sr-only"
                    htmlFor="pokedex-type"
                  >
                    Type
                  </label>
                  <select
                    id="pokedex-type"
                    className="input input-sm"
                    value={typeFilter}
                    onChange={(e) =>
                      setTypeFilter(e.target.value)
                    }
                  >
                    <option value="all">All types</option>
                    <option value="fire">Fire</option>
                    <option value="water">Water</option>
                    <option value="grass">Grass</option>
                    <option value="electric">Electric</option>
                    <option value="ice">Ice</option>
                    <option value="fighting">Fighting</option>
                    <option value="poison">Poison</option>
                    <option value="ground">Ground</option>
                    <option value="flying">Flying</option>
                    <option value="psychic">Psychic</option>
                    <option value="bug">Bug</option>
                    <option value="rock">Rock</option>
                    <option value="ghost">Ghost</option>
                    <option value="dragon">Dragon</option>
                    <option value="dark">Dark</option>
                    <option value="steel">Steel</option>
                    <option value="fairy">Fairy</option>
                  </select>
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label
                    className="field-label sr-only"
                    htmlFor="pokedex-role"
                  >
                    Role
                  </label>
                  <select
                    id="pokedex-role"
                    className="input input-sm"
                    value={roleFilter}
                    onChange={(e) =>
                      setRoleFilter(e.target.value)
                    }
                  >
                    <option value="all">All roles</option>
                    <option value="sweeper">Sweeper</option>
                    <option value="wall">Wall</option>
                    <option value="pivot">Pivot</option>
                    <option value="hazards">Hazards</option>
                    <option value="support">Support</option>
                    <option value="speed">Speed</option>
                    <option value="setup">Setup</option>
                  </select>
                </div>
                <div className="field">
                  <label
                    className="field-label sr-only"
                    htmlFor="pokedex-legality"
                  >
                    Legality
                  </label>
                  <select
                    id="pokedex-legality"
                    className="input input-sm"
                    value={legalityFilter}
                    onChange={(e) =>
                      setLegalityFilter(
                        e.target.value as LegalityFilter
                      )
                    }
                  >
                    <option value="all">All legality</option>
                    <option value="allowed">Allowed</option>
                    <option value="banned">Banned</option>
                    <option value="restricted">
                      Restricted / Limited
                    </option>
                  </select>
                </div>
                <div className="field">
                  <label
                    className="field-label sr-only"
                    htmlFor="pokedex-sort"
                  >
                    Sort
                  </label>
                  <select
                    id="pokedex-sort"
                    className="input input-sm"
                    value={sortOrder}
                    onChange={(e) =>
                      setSortOrder(
                        e.target.value as PokedexSortOrder
                      )
                    }
                  >
                    <option value="name">Name (A–Z)</option>
                    <option value="cost_high">
                      Cost: high → low
                    </option>
                    <option value="cost_low">
                      Cost: low → high
                    </option>
                    <option value="bst_high">
                      Base stat total: high → low
                    </option>
                    <option value="usage">
                      Usage this season
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {listBusy && <div>Loading Pokedex…</div>}

            {!listBusy && !hasAny && (
              <div className="empty-state">
                No Pokémon match these filters. Try relaxing your search or
                clearing the type/role filters.
              </div>
            )}

            {hasAny && (
              <div className="table-wrapper pokedex-table-wrapper">
                <table className="table table-sm pokedex-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Name</th>
                      <th>Types</th>
                      <th>Legality</th>
                      <th>Cost</th>
                      <th>Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.slice(0, 100).map((e) => {
                      const selected = e.pokemonId === selectedId;
                      const globalLeg = e.globalLegality ?? "Unknown";
                      const seasonLeg = e.seasonLegality ?? null;

                      return (
                        <tr
                          key={e.pokemonId}
                          className={
                            selected ? "row-selected" : ""
                          }
                          onClick={() =>
                            setSelectedId(e.pokemonId)
                          }
                        >
                          <td>
                            {e.spriteUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={e.spriteUrl}
                                alt={e.name}
                                className="pokedex-sprite"
                              />
                            ) : (
                              <span className="pokedex-sprite-placeholder">
                                #
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="stack stack-xs">
                              <span>{e.name}</span>
                              {e.tierLabel && (
                                <span className="badge badge-soft badge-xs">
                                  {e.tierLabel}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-muted text-xs">
                            {e.types.join(" / ")}
                          </td>
                          <td className="text-muted text-xs">
                            <span className="pill pill-outline pill-xs">
                              {globalLeg}
                            </span>
                            {seasonLeg && (
                              <span className="pill pill-soft pill-xs ml-xs">
                                {seasonLeg}
                              </span>
                            )}
                          </td>
                          <td className="text-muted text-xs">
                            {e.seasonCost != null ? (
                              <>
                                {e.seasonCost} pts
                                {e.globalCost != null &&
                                  e.globalCost !== e.seasonCost && (
                                    <span className="text-muted text-xxs ml-xs">
                                      (base {e.globalCost})
                                    </span>
                                  )}
                              </>
                            ) : e.globalCost != null ? (
                              `${e.globalCost} pts`
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="text-muted text-xs">
                            {formatPercent(e.usagePercent ?? null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {entries.length > 100 && (
                  <p className="text-muted text-xs mt-xs">
                    Showing first 100 results. Narrow your filters for more
                    specific search.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: Detail panel */}
        <section className="card pokedex-detail-card">
          <div className="card-header">
            <h2 className="card-title">Detail</h2>
            <p className="card-subtitle">
              Base stats, abilities, and balance context for the selected
              Pokémon.
            </p>
          </div>
          <div className="card-body">
            {selectedId == null && (
              <div className="empty-state">
                Select a Pokémon from the list to see details.
              </div>
            )}

            {selectedId != null && loadingDetail && !combinedSelected && (
              <div>Loading details…</div>
            )}

            {combinedSelected && (
              <div className="stack stack-lg">
                {/* Header */}
                <div className="pokedex-detail-header">
                  <div className="pokedex-detail-main">
                    <div className="stack stack-xs">
                      <div className="stack stack-xs">
                        <h2 className="section-title">
                          {combinedSelected.name}
                        </h2>
                        <div className="pill-row">
                          {combinedSelected.types.map((t) => (
                            <span
                              key={t}
                              className="pill pill-soft pill-xs"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="pill-row">
                        {combinedSelected.tierLabel && (
                          <span className="pill pill-outline pill-xs">
                            {combinedSelected.tierLabel}
                          </span>
                        )}
                        {combinedSelected.globalLegality && (
                          <span className="pill pill-outline pill-xs">
                            Global:{" "}
                            {combinedSelected.globalLegality}
                          </span>
                        )}
                        {combinedSelected.seasonLegality && (
                          <span className="pill pill-soft pill-xs">
                            Season:{" "}
                            {combinedSelected.seasonLegality}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="pokedex-detail-sprite">
                    {combinedSelected.spriteUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={combinedSelected.spriteUrl}
                        alt={combinedSelected.name}
                        className="pokedex-sprite-large"
                      />
                    ) : (
                      <div className="pokedex-sprite-large placeholder" />
                    )}
                  </div>
                </div>

                {/* Quick metrics */}
                <div className="grid grid-3">
                  <div className="metric-card">
                    <div className="metric-label">
                      Season cost
                    </div>
                    <div className="metric-value">
                      {combinedSelected.seasonCost != null
                        ? `${combinedSelected.seasonCost} pts`
                        : combinedSelected.globalCost != null
                        ? `${combinedSelected.globalCost} pts`
                        : "—"}
                    </div>
                    {combinedSelected.globalCost != null &&
                      combinedSelected.seasonCost != null &&
                      combinedSelected.globalCost !==
                        combinedSelected.seasonCost && (
                        <div className="metric-caption text-muted text-xs">
                          Base {combinedSelected.globalCost} pts
                        </div>
                      )}
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">
                      Base stat total
                    </div>
                    <div className="metric-value">
                      {combinedSelected.bst ?? "—"}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-label">
                      Usage (this season)
                    </div>
                    <div className="metric-value">
                      {formatPercent(
                        combinedSelected.usagePercent ?? null
                      )}
                    </div>
                  </div>
                </div>

                {/* Roles & description */}
                <div className="stack stack-sm">
                  {combinedSelected.roles &&
                    combinedSelected.roles.length > 0 && (
                      <div className="stack stack-xs">
                        <span className="section-label">
                          Roles / tags
                        </span>
                        <div className="pill-row">
                          {combinedSelected.roles.map((r) => (
                            <span
                              key={r}
                              className="pill pill-soft pill-xs"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {combinedSelected.shortDescription && (
                    <p className="text-muted text-xs">
                      {combinedSelected.shortDescription}
                    </p>
                  )}
                </div>

                {/* Base stats */}
                {combinedSelected.baseStats && (
                  <div className="stack stack-xs">
                    <span className="section-label">
                      Base stats
                    </span>
                    <div className="pokedex-stats-grid">
                      <StatRow label="HP" value={combinedSelected.baseStats.hp} />
                      <StatRow
                        label="Atk"
                        value={combinedSelected.baseStats.atk}
                      />
                      <StatRow
                        label="Def"
                        value={combinedSelected.baseStats.def}
                      />
                      <StatRow
                        label="SpA"
                        value={combinedSelected.baseStats.spa}
                      />
                      <StatRow
                        label="SpD"
                        value={combinedSelected.baseStats.spd}
                      />
                      <StatRow
                        label="Spe"
                        value={combinedSelected.baseStats.spe}
                      />
                    </div>
                  </div>
                )}

                {/* Abilities */}
                {(combinedSelected.primaryAbility ||
                  combinedSelected.secondaryAbilities ||
                  combinedSelected.hiddenAbility) && (
                  <div className="stack stack-xs">
                    <span className="section-label">
                      Abilities
                    </span>
                    <ul className="list list-compact">
                      {combinedSelected.primaryAbility && (
                        <li>
                          <span className="text-xs">
                            {combinedSelected.primaryAbility}
                          </span>
                          <span className="text-muted text-xxs ml-xs">
                            (primary)
                          </span>
                        </li>
                      )}
                      {combinedSelected.secondaryAbilities &&
                        combinedSelected.secondaryAbilities.map(
                          (a) => (
                            <li key={a}>
                              <span className="text-xs">
                                {a}
                              </span>
                              <span className="text-muted text-xxs ml-xs">
                                (secondary)
                              </span>
                            </li>
                          )
                        )}
                      {combinedSelected.hiddenAbility && (
                        <li>
                          <span className="text-xs">
                            {combinedSelected.hiddenAbility}
                          </span>
                          <span className="text-muted text-xxs ml-xs">
                            (hidden)
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Balance voting summary & controls */}
                <div className="card card-subtle">
                  <div className="card-header card-header--compact">
                    <h3 className="card-title text-sm">
                      Balance votes
                    </h3>
                    <p className="card-subtitle text-xxs">
                      Community suggestions for ban status and cost.
                    </p>
                  </div>
                  <div className="card-body">
                    <div className="grid grid-2">
                      <div className="stack stack-xs">
                        <span className="section-label text-xs">
                          Ban vs keep
                        </span>
                        <div className="pill-row">
                          <span className="badge badge-soft badge-xs">
                            Ban:{" "}
                            {combinedSelected.banVotesFor ?? 0}
                          </span>
                          <span className="badge badge-soft badge-xs ml-xs">
                            Keep:{" "}
                            {combinedSelected.banVotesAgainst ?? 0}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary mt-xs"
                          disabled={
                            banVoteBusyId ===
                            combinedSelected.pokemonId
                          }
                          onClick={() =>
                            castBanVote(combinedSelected)
                          }
                        >
                          {banVoteBusyId ===
                          combinedSelected.pokemonId
                            ? "Submitting…"
                            : "Submit ban / keep vote"}
                        </button>
                      </div>

                      <div className="stack stack-xs">
                        <span className="section-label text-xs">
                          Cost suggestions
                        </span>
                        <div className="stack stack-xxs">
                          <span className="text-muted text-xxs">
                            Community centre:{" "}
                            {combinedSelected.costVoteCenter !=
                            null
                              ? `${combinedSelected.costVoteCenter} pts`
                              : "—"}
                          </span>
                        </div>
                        <div className="field-row field-row--dense mt-xs">
                          <input
                            className="input input-xs"
                            value={costVoteTarget}
                            onChange={(e) =>
                              setCostVoteTarget(e.target.value)
                            }
                            placeholder="Target cost (pts)"
                          />
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            disabled={
                              costVoteBusyId ===
                              combinedSelected.pokemonId
                            }
                            onClick={() =>
                              castCostVote(combinedSelected)
                            }
                          >
                            {costVoteBusyId ===
                            combinedSelected.pokemonId
                              ? "Submitting…"
                              : "Suggest cost"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="card-footer">
                    <span className="text-muted text-xxs">
                      Final ban and cost decisions come from
                      commissioners/superadmins, who see these votes in the
                      Pokedex balance dashboard.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// -----------------------------
// Small stat bar row
// -----------------------------

function StatRow(props: { label: string; value: number }) {
  const { label, value } = props;
  const clamped = Math.max(1, Math.min(255, value || 1));
  const pct = Math.round((clamped / 255) * 100);

  return (
    <div className="pokedex-stat-row">
      <span className="pokedex-stat-label">{label}</span>
      <div className="pokedex-stat-bar-wrapper">
        <div
          className="pokedex-stat-bar"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="pokedex-stat-value">{value}</span>
    </div>
  );
}
