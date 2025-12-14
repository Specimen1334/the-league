"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

type MarketplaceTab =
  | "trade-centre"
  | "free-agents"
  | "shop"
  | "my-trades"
  | "insights";

type HttpErrorWithStatus = Error & { status?: number };

// -----------------------------
// Types – aligned with backend design
// -----------------------------

type MarketTeamSummary = {
  teamId: number;
  teamName: string;
  logoUrl?: string | null;
  managerName?: string | null;
  recordSummary?: string | null; // e.g. "3-2-0"
  standingPosition?: number | null;
  trend?: "up" | "down" | "flat" | null;
  isYou?: boolean;
};

type MarketRosterEntry = {
  pokemonInstanceId: number;
  pokemonId: number;
  name: string;
  types: string[];
  tierLabel?: string | null;
  cost?: number | null;
};

type FreeAgentEntry = {
  pokemonId: number;
  name: string;
  types: string[];
  tierLabel?: string | null;
  cost?: number | null;
  isClaimed?: boolean;
};

type ShopItem = {
  id: number;
  name: string;
  description: string | null;
  category?: string | null;
  price: number;
  maxStack?: number | null;
  ownedQuantity?: number | null;
};

type TradeStatus =
  | "Pending"
  | "Accepted"
  | "Rejected"
  | "Cancelled"
  | "Countered"
  | string;

type TradeSideAsset = {
  type: "pokemon" | "item" | "pick" | string;
  label: string; // "Garchomp (Tier S)" etc
};

type TradeSummary = {
  id: number;
  status: TradeStatus;
  createdAt: string | null;
  fromTeamId: number;
  fromTeamName: string;
  toTeamId: number;
  toTeamName: string;
  youAreSender?: boolean;
  youAreRecipient?: boolean;
  assetsFrom: TradeSideAsset[];
  assetsTo: TradeSideAsset[];
  message?: string | null;
};

type TradesList = {
  incoming: TradeSummary[];
  outgoing: TradeSummary[];
};

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

function mapTeams(raw: any): MarketTeamSummary[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((t) => ({
    teamId: t.teamId ?? t.team_id,
    teamName: t.teamName ?? t.team_name,
    logoUrl: t.logoUrl ?? t.logo_url ?? null,
    managerName:
      t.managerName ?? t.manager_name ?? t.managerDisplayName ?? null,
    recordSummary:
      t.recordSummary ??
      t.record_summary ??
      t.record ??
      null,
    standingPosition:
      typeof t.standingPosition === "number"
        ? t.standingPosition
        : typeof t.standing_position === "number"
        ? t.standing_position
        : null,
    trend:
      t.trend === "up" || t.trend === "down" || t.trend === "flat"
        ? t.trend
        : null,
    isYou: Boolean(t.isYou ?? t.is_you ?? false)
  }));
}

function mapRoster(raw: any): MarketRosterEntry[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((r) => ({
    pokemonInstanceId:
      r.pokemonInstanceId ?? r.pokemon_instance_id ?? r.instanceId,
    pokemonId: r.pokemonId ?? r.pokemon_id,
    name: r.name,
    types:
      Array.isArray(r.types) && r.types.length > 0
        ? r.types
        : [r.primaryType ?? r.type1 ?? "Unknown"].filter(Boolean),
    tierLabel: r.tierLabel ?? r.tier_label ?? r.tier ?? null,
    cost:
      typeof r.cost === "number"
        ? r.cost
        : typeof r.points === "number"
        ? r.points
        : null
  }));
}

function mapFreeAgents(raw: any): FreeAgentEntry[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((f) => ({
    pokemonId: f.pokemonId ?? f.pokemon_id ?? f.id,
    name: f.name,
    types:
      Array.isArray(f.types) && f.types.length > 0
        ? f.types
        : [f.primaryType ?? f.type1 ?? "Unknown"].filter(Boolean),
    tierLabel: f.tierLabel ?? f.tier_label ?? f.tier ?? null,
    cost:
      typeof f.cost === "number"
        ? f.cost
        : typeof f.points === "number"
        ? f.points
        : null,
    isClaimed: Boolean(f.isClaimed ?? f.claimed ?? false)
  }));
}

function mapShopItems(raw: any): ShopItem[] {
  const items = Array.isArray(raw) ? raw : raw.items ?? [];
  return (items as any[]).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description ?? null,
    category: i.category ?? null,
    price:
      typeof i.price === "number"
        ? i.price
        : typeof i.cost === "number"
        ? i.cost
        : 0,
    maxStack:
      typeof i.maxStack === "number"
        ? i.maxStack
        : typeof i.max_stack === "number"
        ? i.max_stack
        : null,
    ownedQuantity:
      typeof i.ownedQuantity === "number"
        ? i.ownedQuantity
        : typeof i.owned_quantity === "number"
        ? i.owned_quantity
        : null
  }));
}

function mapTrades(raw: any): TradesList {
  if (Array.isArray(raw)) {
    const mappedArray = raw.map(mapTradeSummary);
    return {
      incoming: mappedArray.filter((t) => t.youAreRecipient),
      outgoing: mappedArray.filter((t) => t.youAreSender)
    };
  }

  const incomingRaw = raw.incoming ?? [];
  const outgoingRaw = raw.outgoing ?? [];
  return {
    incoming: (incomingRaw as any[]).map(mapTradeSummary),
    outgoing: (outgoingRaw as any[]).map(mapTradeSummary)
  };
}

function mapTradeSummary(t: any): TradeSummary {
  const assetsFromRaw = t.assetsFrom ?? t.from_assets ?? t.fromAssets ?? [];
  const assetsToRaw = t.assetsTo ?? t.to_assets ?? t.toAssets ?? [];

  const mapAsset = (a: any): TradeSideAsset => ({
    type: a.type ?? a.kind ?? "pokemon",
    label:
      a.label ??
      a.summary ??
      a.name ??
      (a.pokemonName ?? a.pokemon_name ?? "Asset")
  });

  return {
    id: t.id,
    status: t.status ?? "Pending",
    createdAt: t.createdAt ?? t.created_at ?? null,
    fromTeamId: t.fromTeamId ?? t.from_team_id,
    fromTeamName: t.fromTeamName ?? t.from_team_name ?? "From team",
    toTeamId: t.toTeamId ?? t.to_team_id,
    toTeamName: t.toTeamName ?? t.to_team_name ?? "To team",
    youAreSender: Boolean(t.youAreSender ?? t.you_are_sender),
    youAreRecipient: Boolean(t.youAreRecipient ?? t.you_are_recipient),
    assetsFrom: (assetsFromRaw as any[]).map(mapAsset),
    assetsTo: (assetsToRaw as any[]).map(mapAsset),
    message: t.message ?? t.note ?? null
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "TBA";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBA";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

// -----------------------------
// Page component
// -----------------------------

export default function MarketplacePage() {
  const params = useParams<{ seasonId: string }>();
  const seasonId = Number(params?.seasonId);

  const [tab, setTab] = useState<MarketplaceTab>("trade-centre");

  const [teams, setTeams] = useState<MarketTeamSummary[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgentEntry[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [trades, setTrades] = useState<TradesList | null>(null);

  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  const [myRoster, setMyRoster] = useState<MarketRosterEntry[]>([]);

  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingFreeAgents, setLoadingFreeAgents] = useState(true);
  const [loadingShop, setLoadingShop] = useState(true);
  const [loadingTrades, setLoadingTrades] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [errorTeams, setErrorTeams] = useState<string | null>(null);
  const [errorFreeAgents, setErrorFreeAgents] = useState<string | null>(null);
  const [errorShop, setErrorShop] = useState<string | null>(null);
  const [errorTrades, setErrorTrades] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [claimLoadingId, setClaimLoadingId] = useState<number | null>(null);
  const [claimDropId, setClaimDropId] = useState<number | null>(null);

  const [shopQuantities, setShopQuantities] = useState<Record<number, number>>(
    {}
  );
  const [shopActionItemId, setShopActionItemId] = useState<number | null>(null);

  const [tradeActionId, setTradeActionId] = useState<number | null>(null);

  const [teamSearch, setTeamSearch] = useState("");
  const [faSearch, setFaSearch] = useState("");
  const [faTypeFilter, setFaTypeFilter] = useState<string>("all");
  const [faShowClaimed, setFaShowClaimed] = useState(false);

  // -----------------------------
  // Initial load
  // -----------------------------

  useEffect(() => {
    if (!Number.isFinite(seasonId) || seasonId <= 0) {
      setGlobalError("Invalid season ID.");
      setLoadingTeams(false);
      setLoadingFreeAgents(false);
      setLoadingShop(false);
      setLoadingTrades(false);
      return;
    }

    let cancelled = false;

    async function loadTeamsAndRoster() {
      setLoadingTeams(true);
      setErrorTeams(null);
      try {
        const rawTeams = await fetchJson<any>(
          `/seasons/${seasonId}/marketplace/teams`
        );
        if (cancelled) return;
        const mappedTeams = mapTeams(rawTeams);
        setTeams(mappedTeams);

        const my = mappedTeams.find((t) => t.isYou);
        if (my) {
          setMyTeamId(my.teamId);
          setLoadingRoster(true);
          try {
            const rawRoster = await fetchJson<any>(
              `/seasons/${seasonId}/marketplace/teams/${my.teamId}/roster`
            );
            if (!cancelled) {
              setMyRoster(mapRoster(rawRoster));
            }
          } catch {
            if (!cancelled) {
              // non-fatal; just no roster
              setMyRoster([]);
            }
          } finally {
            if (!cancelled) setLoadingRoster(false);
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        setErrorTeams(err?.message ?? "Failed to load marketplace teams.");
      } finally {
        if (!cancelled) setLoadingTeams(false);
      }
    }

    async function loadFreeAgents() {
      setLoadingFreeAgents(true);
      setErrorFreeAgents(null);
      try {
        const raw = await fetchJson<any>(`/seasons/${seasonId}/free-agents`);
        if (cancelled) return;
        setFreeAgents(mapFreeAgents(raw));
      } catch (err: any) {
        if (cancelled) return;
        setErrorFreeAgents(
          err?.message ?? "Failed to load free agents / waiver wire."
        );
      } finally {
        if (!cancelled) setLoadingFreeAgents(false);
      }
    }

    async function loadShop() {
      setLoadingShop(true);
      setErrorShop(null);
      try {
        const raw = await fetchJson<any>(
          `/seasons/${seasonId}/shop/items`
        );
        if (cancelled) return;
        setShopItems(mapShopItems(raw));
      } catch (err: any) {
        if (cancelled) return;
        setErrorShop(err?.message ?? "Failed to load item shop.");
      } finally {
        if (!cancelled) setLoadingShop(false);
      }
    }

    async function loadTrades() {
      setLoadingTrades(true);
      setErrorTrades(null);
      try {
        const raw = await fetchJson<any>(
          `/seasons/${seasonId}/marketplace/trades`
        );
        if (cancelled) return;
        setTrades(mapTrades(raw));
      } catch (err: any) {
        if (cancelled) return;
        setErrorTrades(
          err?.message ?? "Failed to load trade offers for this season."
        );
      } finally {
        if (!cancelled) setLoadingTrades(false);
      }
    }

    loadTeamsAndRoster();
    loadFreeAgents();
    loadShop();
    loadTrades();

    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  // -----------------------------
  // Actions – free agent claim
  // -----------------------------

  async function claimFreeAgent(agent: FreeAgentEntry) {
    if (!seasonId) return;
    setClaimLoadingId(agent.pokemonId);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(`/seasons/${seasonId}/free-agents/claim`, {
        method: "POST",
        body: JSON.stringify({
          pokemonId: agent.pokemonId,
          dropPokemonInstanceId: claimDropId ?? undefined
        })
      });

      // refresh free agents & roster
      const [rawAgents, rawRoster] = await Promise.all([
        fetchJson<any>(`/seasons/${seasonId}/free-agents`),
        myTeamId
          ? fetchJson<any>(
              `/seasons/${seasonId}/marketplace/teams/${myTeamId}/roster`
            )
          : Promise.resolve(null)
      ]);
      setFreeAgents(mapFreeAgents(rawAgents));
      if (rawRoster) {
        setMyRoster(mapRoster(rawRoster));
      }
      setClaimDropId(null);
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to submit waiver / free agent claim."
      );
    } finally {
      setClaimLoadingId(null);
    }
  }

  // -----------------------------
  // Actions – shop buy / sell
  // -----------------------------

  function quantityFor(itemId: number): number {
    return shopQuantities[itemId] ?? 1;
  }

  function setQuantityFor(itemId: number, value: number) {
    if (!Number.isFinite(value) || value <= 0) value = 1;
    setShopQuantities((prev) => ({ ...prev, [itemId]: value }));
  }

  async function purchaseItem(item: ShopItem) {
    if (!seasonId) return;
    const qty = quantityFor(item.id);
    setShopActionItemId(item.id);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(`/seasons/${seasonId}/shop/purchase`, {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, quantity: qty })
      });

      const raw = await fetchJson<any>(
        `/seasons/${seasonId}/shop/items`
      );
      setShopItems(mapShopItems(raw));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to purchase item. Check your budget or limits."
      );
    } finally {
      setShopActionItemId(null);
    }
  }

  async function sellItem(item: ShopItem) {
    if (!seasonId) return;
    const qty = quantityFor(item.id);
    setShopActionItemId(item.id);
    setGlobalError(null);

    try {
      await fetchJson<unknown>(`/seasons/${seasonId}/shop/sell`, {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, quantity: qty })
      });

      const raw = await fetchJson<any>(
        `/seasons/${seasonId}/shop/items`
      );
      setShopItems(mapShopItems(raw));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to sell item. Check your inventory."
      );
    } finally {
      setShopActionItemId(null);
    }
  }

  // -----------------------------
  // Actions – trades
  // -----------------------------

  async function handleTradeAction(
    trade: TradeSummary,
    action: "accept" | "reject" | "counter"
  ) {
    if (!seasonId) return;
    setTradeActionId(trade.id);
    setGlobalError(null);

    const path =
      action === "accept"
        ? `/seasons/${seasonId}/marketplace/trades/${trade.id}/accept`
        : action === "reject"
        ? `/seasons/${seasonId}/marketplace/trades/${trade.id}/reject`
        : `/seasons/${seasonId}/marketplace/trades/${trade.id}/counter`;

    const body: any =
      action === "counter"
        ? {
            // placeholder – later can include counter-proposal payload
          }
        : {};

    try {
      await fetchJson<unknown>(path, {
        method: "POST",
        body: JSON.stringify(body)
      });

      const raw = await fetchJson<any>(
        `/seasons/${seasonId}/marketplace/trades`
      );
      setTrades(mapTrades(raw));
    } catch (err: any) {
      setGlobalError(
        err?.message ?? "Failed to update trade. Please try again."
      );
    } finally {
      setTradeActionId(null);
    }
  }

  // -----------------------------
  // Derived – filters
  // -----------------------------

  const yourTeam = useMemo(
    () => teams.find((t) => t.isYou) ?? null,
    [teams]
  );

  const filteredTeams = useMemo(() => {
    if (!teamSearch.trim()) return teams;
    const q = teamSearch.trim().toLowerCase();
    return teams.filter(
      (t) =>
        t.teamName.toLowerCase().includes(q) ||
        (t.managerName ?? "").toLowerCase().includes(q)
    );
  }, [teams, teamSearch]);

  const filteredFreeAgents = useMemo(() => {
    let list = freeAgents;

    if (!faShowClaimed) {
      list = list.filter((a) => !a.isClaimed);
    }

    if (faTypeFilter !== "all") {
      list = list.filter((a) =>
        a.types
          .map((t) => t.toLowerCase())
          .includes(faTypeFilter.toLowerCase())
      );
    }

    if (faSearch.trim()) {
      const q = faSearch.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }

    return list;
  }, [freeAgents, faSearch, faTypeFilter, faShowClaimed]);

  const incomingTrades = trades?.incoming ?? [];
  const outgoingTrades = trades?.outgoing ?? [];

  // -----------------------------
  // Render
  // -----------------------------

  return (
    <main className="marketplace-page">
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link href="/leagues" className="link">
              Leagues
            </Link>{" "}
            /{" "}
            <span className="breadcrumb-current">
              Season Marketplace
            </span>
          </p>
          <h1 className="page-title">Marketplace</h1>
          <p className="page-subtitle">
            Trade Centre, free agency, and item shop for this season.
          </p>
        </div>
        <div className="page-header-actions">
          {yourTeam && (
            <span className="pill pill-outline pill-xs">
              Your team: {yourTeam.teamName}
            </span>
          )}
        </div>
      </header>

      {globalError && <div className="form-error">{globalError}</div>}
      {errorTeams && <div className="form-error">{errorTeams}</div>}
      {errorFreeAgents && (
        <div className="form-error">{errorFreeAgents}</div>
      )}
      {errorShop && <div className="form-error">{errorShop}</div>}
      {errorTrades && <div className="form-error">{errorTrades}</div>}

      <div className="tabs tabs--underline">
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "trade-centre" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("trade-centre")}
        >
          Trade Centre
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "free-agents" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("free-agents")}
        >
          Free Agency
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "shop" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("shop")}
        >
          Item Shop
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "my-trades" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("my-trades")}
        >
          My Trades
        </button>
        <button
          type="button"
          className={
            "tabs-item" +
            (tab === "insights" ? " tabs-item--active" : "")
          }
          onClick={() => setTab("insights")}
        >
          Market Insights
        </button>
      </div>

      <section className="marketplace-tab-content mt-md">
        {tab === "trade-centre" && (
          <TradeCentreTab
            teams={filteredTeams}
            loading={loadingTeams}
            teamSearch={teamSearch}
            onChangeTeamSearch={setTeamSearch}
          />
        )}

        {tab === "free-agents" && (
          <FreeAgencyTab
            freeAgents={filteredFreeAgents}
            loading={loadingFreeAgents}
            faSearch={faSearch}
            faTypeFilter={faTypeFilter}
            faShowClaimed={faShowClaimed}
            onChangeFaSearch={setFaSearch}
            onChangeFaTypeFilter={setFaTypeFilter}
            onChangeFaShowClaimed={setFaShowClaimed}
            myRoster={myRoster}
            loadingRoster={loadingRoster}
            claimDropId={claimDropId}
            onChangeClaimDropId={setClaimDropId}
            claimLoadingId={claimLoadingId}
            onClaim={claimFreeAgent}
          />
        )}

        {tab === "shop" && (
          <ShopTab
            items={shopItems}
            loading={loadingShop}
            quantities={shopQuantities}
            onChangeQuantity={setQuantityFor}
            actionItemId={shopActionItemId}
            onPurchase={purchaseItem}
            onSell={sellItem}
          />
        )}

        {tab === "my-trades" && (
          <MyTradesTab
            incoming={incomingTrades}
            outgoing={outgoingTrades}
            loading={loadingTrades}
            actionTradeId={tradeActionId}
            onAction={handleTradeAction}
          />
        )}

        {tab === "insights" && (
          <InsightsTab
            teams={teams}
            freeAgents={freeAgents}
            trades={trades}
          />
        )}
      </section>
    </main>
  );
}

// -----------------------------
// Trade Centre tab
// -----------------------------

function TradeCentreTab(props: {
  teams: MarketTeamSummary[];
  loading: boolean;
  teamSearch: string;
  onChangeTeamSearch: (v: string) => void;
}) {
  const { teams, loading, teamSearch, onChangeTeamSearch } = props;
  const hasAny = teams.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Trade Centre</h2>
        <p className="card-subtitle">
          Browse teams and their performance to identify good trade partners.
        </p>
      </div>
      <div className="card-body">
        <div className="field mb-sm">
          <label className="field-label sr-only" htmlFor="team-search">
            Search teams
          </label>
          <input
            id="team-search"
            className="input input-sm"
            placeholder="Search by team or manager…"
            value={teamSearch}
            onChange={(e) => onChangeTeamSearch(e.target.value)}
          />
        </div>

        {loading && !hasAny && <div>Loading teams…</div>}
        {!loading && !hasAny && (
          <div className="empty-state">
            No teams found in this season. Something&apos;s off.
          </div>
        )}

        {hasAny && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>Manager</th>
                  <th>Record</th>
                  <th>Trend</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {teams
                  .slice()
                  .sort((a, b) => {
                    const pa = a.standingPosition ?? 999;
                    const pb = b.standingPosition ?? 999;
                    return pa - pb;
                  })
                  .map((t) => (
                    <tr key={t.teamId}>
                      <td>{t.standingPosition ?? "—"}</td>
                      <td>
                        <div className="stack stack-xs">
                          <span>{t.teamName}</span>
                          {t.isYou && (
                            <span className="badge badge-accent pill-xs">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-muted">
                        {t.managerName ?? "—"}
                      </td>
                      <td className="text-muted">
                        {t.recordSummary ?? "—"}
                      </td>
                      <td className="text-muted">
                        {t.trend === "up" && "▲"}
                        {t.trend === "down" && "▼"}
                        {t.trend === "flat" && "■"}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/teams/${t.teamId}`}
                          className="btn btn-xs btn-ghost"
                        >
                          Team hub
                        </Link>
                        {/* Propose Trade flow can later be a dedicated page or modal */}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// Free Agency tab
// -----------------------------

function FreeAgencyTab(props: {
  freeAgents: FreeAgentEntry[];
  loading: boolean;
  faSearch: string;
  faTypeFilter: string;
  faShowClaimed: boolean;
  onChangeFaSearch: (v: string) => void;
  onChangeFaTypeFilter: (v: string) => void;
  onChangeFaShowClaimed: (v: boolean) => void;
  myRoster: MarketRosterEntry[];
  loadingRoster: boolean;
  claimDropId: number | null;
  onChangeClaimDropId: (id: number | null) => void;
  claimLoadingId: number | null;
  onClaim: (fa: FreeAgentEntry) => void;
}) {
  const {
    freeAgents,
    loading,
    faSearch,
    faTypeFilter,
    faShowClaimed,
    onChangeFaSearch,
    onChangeFaTypeFilter,
    onChangeFaShowClaimed,
    myRoster,
    loadingRoster,
    claimDropId,
    onChangeClaimDropId,
    claimLoadingId,
    onClaim
  } = props;

  const hasAny = freeAgents.length > 0;

  const hasRoster = myRoster.length > 0;

  return (
    <div className="layout-two-column marketplace-free-agency">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Free Agents / Waiver Wire</h2>
          <p className="card-subtitle">
            Browse Pokémon available on waivers or as free agents and submit
            claims.
          </p>
        </div>
        <div className="card-body">
          <div className="field-row mb-sm">
            <div className="field">
              <label
                className="field-label sr-only"
                htmlFor="fa-search"
              >
                Search
              </label>
              <input
                id="fa-search"
                className="input input-sm"
                placeholder="Search by name…"
                value={faSearch}
                onChange={(e) => onChangeFaSearch(e.target.value)}
              />
            </div>
            <div className="field">
              <label
                className="field-label sr-only"
                htmlFor="fa-type"
              >
                Type
              </label>
              <select
                id="fa-type"
                className="input input-sm"
                value={faTypeFilter}
                onChange={(e) => onChangeFaTypeFilter(e.target.value)}
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
            <div className="field field--inline">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={faShowClaimed}
                  onChange={(e) =>
                    onChangeFaShowClaimed(e.target.checked)
                  }
                />
                <span>Show claimed</span>
              </label>
            </div>
          </div>

          {loading && !hasAny && <div>Loading free agents…</div>}
          {!loading && !hasAny && (
            <div className="empty-state">
              No free agents currently available.
            </div>
          )}

          {hasAny && (
            <div className="table-wrapper">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Types</th>
                    <th>Tier</th>
                    <th>Cost</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {freeAgents.slice(0, 80).map((fa) => {
                    const disabled =
                      fa.isClaimed || claimLoadingId === fa.pokemonId;
                    return (
                      <tr key={fa.pokemonId}>
                        <td>{fa.name}</td>
                        <td className="text-muted text-xs">
                          {fa.types.join(" / ")}
                        </td>
                        <td className="text-muted text-xs">
                          {fa.tierLabel ?? "—"}
                        </td>
                        <td className="text-muted text-xs">
                          {fa.cost != null ? `${fa.cost} pts` : "—"}
                        </td>
                        <td className="text-right">
                          {fa.isClaimed && (
                            <span className="badge badge-muted badge-xs mr-xs">
                              Claimed
                            </span>
                          )}
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            disabled={disabled}
                            onClick={() => onClaim(fa)}
                          >
                            {claimLoadingId === fa.pokemonId
                              ? "Submitting…"
                              : "Request pickup"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {freeAgents.length > 80 && (
                <p className="text-muted text-xs mt-xs">
                  Showing first 80 free agents. Narrow your filters to see
                  specific Pokémon.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Your roster (for drops)</h2>
          <p className="card-subtitle">
            If you&apos;re at max roster, select a Pokémon to drop when
            submitting a claim.
          </p>
        </div>
        <div className="card-body">
          {loadingRoster && <div>Loading roster…</div>}
          {!loadingRoster && !hasRoster && (
            <div className="empty-state">
              No roster found yet, or you&apos;re not attached to a team in
              this season.
            </div>
          )}
          {hasRoster && (
            <ul className="list list-divided">
              {myRoster.map((r) => {
                const selected = claimDropId === r.pokemonInstanceId;
                return (
                  <li
                    key={r.pokemonInstanceId}
                    className={
                      "list-item list-item--dense" +
                      (selected ? " list-item--selected" : "")
                    }
                  >
                    <div className="list-item-main">
                      <div className="list-item-title-row">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            onChangeClaimDropId(
                              selected ? null : r.pokemonInstanceId
                            )
                          }
                        >
                          {r.name}
                        </button>
                        {r.tierLabel && (
                          <span className="pill pill-outline pill-xs">
                            {r.tierLabel}
                          </span>
                        )}
                      </div>
                      <div className="list-item-meta-row">
                        <span className="text-muted text-xs">
                          {r.types.join(" / ")}
                        </span>
                        {r.cost != null && (
                          <span className="badge badge-soft ml-sm">
                            {r.cost} pts
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Item Shop tab
// -----------------------------

function ShopTab(props: {
  items: ShopItem[];
  loading: boolean;
  quantities: Record<number, number>;
  onChangeQuantity: (itemId: number, qty: number) => void;
  actionItemId: number | null;
  onPurchase: (item: ShopItem) => void;
  onSell: (item: ShopItem) => void;
}) {
  const {
    items,
    loading,
    quantities,
    onChangeQuantity,
    actionItemId,
    onPurchase,
    onSell
  } = props;

  const hasAny = items.length > 0;

  function qtyFor(itemId: number): number {
    return quantities[itemId] ?? 1;
  }

  function handleQtyChange(itemId: number, raw: string) {
    const n = Number(raw.replace(/[^0-9]/g, ""));
    const value = !Number.isFinite(n) || n <= 0 ? 1 : n;
    onChangeQuantity(itemId, value);
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Item Shop</h2>
        <p className="card-subtitle">
          Buy and sell items with your league currency. Exact rules depend on
          the season configuration.
        </p>
      </div>
      <div className="card-body">
        {loading && !hasAny && <div>Loading shop…</div>}
        {!loading && !hasAny && (
          <div className="empty-state">
            No items available in this season&apos;s shop.
          </div>
        )}

        {hasAny && (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Owned</th>
                  <th>Qty</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const qty = qtyFor(i.id);
                  const busy = actionItemId === i.id;
                  return (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td className="text-muted text-xs">
                        {i.description ?? "—"}
                      </td>
                      <td className="text-muted text-xs">
                        {i.category ?? "—"}
                      </td>
                      <td className="text-muted text-xs">
                        {i.price} pts
                      </td>
                      <td className="text-muted text-xs">
                        {i.ownedQuantity ?? 0}
                      </td>
                      <td className="text-muted text-xs">
                        <input
                          type="text"
                          className="input input-xs"
                          value={String(qty)}
                          onChange={(e) =>
                            handleQtyChange(i.id, e.target.value)
                          }
                        />
                      </td>
                      <td className="text-right">
                        <div className="btn-group btn-group-xs">
                          <button
                            type="button"
                            className="btn btn-xs btn-primary"
                            disabled={busy}
                            onClick={() => onPurchase(i)}
                          >
                            {busy ? "…" : "Buy"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            disabled={busy || !i.ownedQuantity}
                            onClick={() => onSell(i)}
                          >
                            {busy ? "…" : "Sell"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card-footer">
        <span className="text-muted text-xs">
          League rules decide which items are legal in matches and how they
          interact with trades.
        </span>
      </div>
    </div>
  );
}

// -----------------------------
// My Trades tab
// -----------------------------

function MyTradesTab(props: {
  incoming: TradeSummary[];
  outgoing: TradeSummary[];
  loading: boolean;
  actionTradeId: number | null;
  onAction: (
    trade: TradeSummary,
    action: "accept" | "reject" | "counter"
  ) => void;
}) {
  const { incoming, outgoing, loading, actionTradeId, onAction } = props;

  const hasIncoming = incoming.length > 0;
  const hasOutgoing = outgoing.length > 0;

  function renderSideAssets(assets: TradeSideAsset[]) {
    if (!assets.length) return "—";
    return assets.map((a) => a.label).join(", ");
  }

  return (
    <div className="layout-two-column marketplace-trades">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Incoming offers</h2>
          <p className="card-subtitle">
            Trades other teams have proposed to you. Accept, reject, or send a
            counter.
          </p>
        </div>
        <div className="card-body">
          {loading && !hasIncoming && <div>Loading trades…</div>}
          {!loading && !hasIncoming && (
            <div className="empty-state">
              No incoming trade offers yet.
            </div>
          )}
          {hasIncoming && (
            <div className="table-wrapper">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>They send</th>
                    <th>You send</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((t) => {
                    const busy = actionTradeId === t.id;
                    return (
                      <tr key={t.id}>
                        <td>{t.fromTeamName}</td>
                        <td className="text-muted text-xs">
                          {renderSideAssets(t.assetsFrom)}
                        </td>
                        <td className="text-muted text-xs">
                          {renderSideAssets(t.assetsTo)}
                        </td>
                        <td>
                          <span className="badge badge-soft">
                            {t.status}
                          </span>
                        </td>
                        <td className="text-muted text-xs">
                          {formatDateTime(t.createdAt)}
                        </td>
                        <td className="text-right">
                          {t.status === "Pending" && (
                            <div className="btn-group btn-group-xs">
                              <button
                                type="button"
                                className="btn btn-xs btn-primary"
                                disabled={busy}
                                onClick={() =>
                                  onAction(t, "accept")
                                }
                              >
                                {busy ? "…" : "Accept"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                disabled={busy}
                                onClick={() =>
                                  onAction(t, "reject")
                                }
                              >
                                {busy ? "…" : "Reject"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost"
                                disabled={busy}
                                onClick={() =>
                                  onAction(t, "counter")
                                }
                              >
                                {busy ? "…" : "Counter"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Outgoing offers</h2>
          <p className="card-subtitle">
            Trades you have proposed. Track their status and responses.
          </p>
        </div>
        <div className="card-body">
          {loading && !hasOutgoing && <div>Loading trades…</div>}
          {!loading && !hasOutgoing && (
            <div className="empty-state">
              No outgoing trades yet. Use the Trade Centre or team hubs to
              identify partners.
            </div>
          )}
          {hasOutgoing && (
            <div className="table-wrapper">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>To</th>
                    <th>You send</th>
                    <th>They send</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((t) => (
                    <tr key={t.id}>
                      <td>{t.toTeamName}</td>
                      <td className="text-muted text-xs">
                        {renderSideAssets(t.assetsFrom)}
                      </td>
                      <td className="text-muted text-xs">
                        {renderSideAssets(t.assetsTo)}
                      </td>
                      <td>
                        <span className="badge badge-soft">
                          {t.status}
                        </span>
                      </td>
                      <td className="text-muted text-xs">
                        {formatDateTime(t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Market Insights tab
// -----------------------------

function InsightsTab(props: {
  teams: MarketTeamSummary[];
  freeAgents: FreeAgentEntry[];
  trades: TradesList | null;
}) {
  const { teams, freeAgents, trades } = props;

  const totalTeams = teams.length;
  const totalFreeAgents = freeAgents.length;
  const totalIncoming = trades?.incoming.length ?? 0;
  const totalOutgoing = trades?.outgoing.length ?? 0;

  const topTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams
      .slice()
      .sort((a, b) => (a.standingPosition ?? 999) - (b.standingPosition ?? 999))[
      0
    ];
  }, [teams]);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Market Insights</h2>
        <p className="card-subtitle">
          Lightweight snapshot of how active this season&apos;s marketplace is.
          Deeper analytics can plug in here later.
        </p>
      </div>
      <div className="card-body">
        <div className="grid grid-3">
          <div className="metric-card">
            <div className="metric-label">Teams in season</div>
            <div className="metric-value">{totalTeams}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Free agents</div>
            <div className="metric-value">{totalFreeAgents}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Trade traffic</div>
            <div className="metric-value">
              {totalIncoming + totalOutgoing}
            </div>
            <div className="metric-caption text-muted text-xs">
              {totalIncoming} incoming · {totalOutgoing} outgoing
            </div>
          </div>
        </div>

        {topTeam && (
          <div className="card card-subtle mt-md">
            <div className="card-body">
              <div className="stack stack-xs">
                <span className="text-muted text-xs">
                  Current top seed
                </span>
                <span className="pill pill-soft">{topTeam.teamName}</span>
                <span className="text-muted text-xs">
                  {topTeam.recordSummary ?? "Record unavailable"}
                </span>
              </div>
            </div>
          </div>
        )}

        <p className="text-muted text-xs mt-md">
          Over time, this tab can visualise trade networks, positional needs,
          and balance metrics powered by the Pokedex and match data.
        </p>
      </div>
    </div>
  );
}
