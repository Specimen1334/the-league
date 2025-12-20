// apps/web/lib/pokemon-types.ts

export const TYPES = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy"
] as const;

export type PokemonType = (typeof TYPES)[number];

// UI colours (Pokémon type palette)
// Keep in one place so components/pages can render consistent type styling.
export const TYPE_COLORS: Record<PokemonType, string> = {
  Normal: "#A8A77A",
  Fire: "#EE8130",
  Water: "#6390F0",
  Electric: "#F7D02C",
  Grass: "#7AC74C",
  Ice: "#96D9D6",
  Fighting: "#C22E28",
  Poison: "#A33EA1",
  Ground: "#E2BF65",
  Flying: "#A98FF3",
  Psychic: "#F95587",
  Bug: "#A6B91A",
  Rock: "#B6A136",
  Ghost: "#735797",
  Dragon: "#6F35FC",
  Dark: "#705746",
  Steel: "#B7B7CE",
  Fairy: "#D685AD"
};

// Gen 9 type chart (attack -> defend -> multiplier)
// Source: standard Pokémon mechanics; kept local for draft-room speed & offline use.
const CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 }
};

export function effectiveness(attacking: PokemonType, defending: PokemonType): number {
  return CHART[attacking]?.[defending] ?? 1;
}

export function normalizeType(t: string): PokemonType | null {
  const raw = t.trim();
  if (!raw) return null;
  // Accept a few common wire formats:
  // - "Dragon" (expected)
  // - "DRAGON" / "dragon" (common API variants)
  const candidate = raw[0] ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : raw;
  if ((TYPES as readonly string[]).includes(raw)) return raw as PokemonType;
  if ((TYPES as readonly string[]).includes(candidate)) return candidate as PokemonType;
  return null;
}

export function teamTypeSet(teamTypes: string[][]): Set<PokemonType> {
  const set = new Set<PokemonType>();
  for (const types of teamTypes) {
    for (const t of types) {
      const nt = normalizeType(t);
      if (nt) set.add(nt);
    }
  }
  return set;
}

export type DefenseSummary = {
  immune: PokemonType[];
  resist: PokemonType[];
  weak: PokemonType[];
  neutral: PokemonType[];
  multipliers: Record<PokemonType, number>;
};

export function defenseSummary(teamDefTypes: string[][]): DefenseSummary {
  const multipliers: Record<PokemonType, number> = Object.fromEntries(
    TYPES.map((t) => [t, 1])
  ) as Record<PokemonType, number>;

  // For a set of Pokémon, defensive summary is based on average (multiplicative per mon)
  // but as a team tool, we classify by "at least one resist/immune" / "at least one weak".
  // We'll compute min multiplier (best) and max multiplier (worst) across the team per attack type.
  const minByAtk: Record<PokemonType, number> = Object.fromEntries(TYPES.map((t) => [t, 1])) as any;
  const maxByAtk: Record<PokemonType, number> = Object.fromEntries(TYPES.map((t) => [t, 1])) as any;

  for (const atk of TYPES) {
    let min = 1;
    let max = 1;
    for (const defTypes of teamDefTypes) {
      let m = 1;
      for (const dtRaw of defTypes) {
        const dt = normalizeType(dtRaw);
        if (!dt) continue;
        m *= effectiveness(atk, dt);
      }
      min = Math.min(min, m);
      max = Math.max(max, m);
    }
    minByAtk[atk] = min;
    maxByAtk[atk] = max;
    // For display, store worst-case ("what can punish my team")
    multipliers[atk] = max;
  }

  const immune: PokemonType[] = [];
  const resist: PokemonType[] = [];
  const weak: PokemonType[] = [];
  const neutral: PokemonType[] = [];

  for (const atk of TYPES) {
    const worst = maxByAtk[atk];
    const best = minByAtk[atk];
    if (best === 0) {
      immune.push(atk);
    } else if (worst < 1) {
      resist.push(atk);
    } else if (worst > 1) {
      weak.push(atk);
    } else {
      neutral.push(atk);
    }
  }

  return { immune, resist, weak, neutral, multipliers };
}
