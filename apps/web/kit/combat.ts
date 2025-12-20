// apps/web/kit/combat.ts

// Small shared type helpers used by the redesigned draft room.

export const TYPES = [
  "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground","Flying",
  "Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy",
] as const;

export type TypeName = (typeof TYPES)[number];

// Gen 6+ type chart (enough for high-level coverage/defense summaries).
const chart: Record<string, Record<string, number>> = {
  Normal: { Rock:0.5, Ghost:0, Steel:0.5 },
  Fire: { Fire:0.5, Water:0.5, Grass:2, Ice:2, Bug:2, Rock:0.5, Dragon:0.5, Steel:2 },
  Water: { Fire:2, Water:0.5, Grass:0.5, Ground:2, Rock:2, Dragon:0.5 },
  Electric: { Water:2, Electric:0.5, Grass:0.5, Ground:0, Flying:2, Dragon:0.5 },
  Grass: { Fire:0.5, Water:2, Grass:0.5, Poison:0.5, Ground:2, Flying:0.5, Bug:0.5, Rock:2, Dragon:0.5, Steel:0.5 },
  Ice: { Fire:0.5, Water:0.5, Grass:2, Ground:2, Flying:2, Dragon:2, Steel:0.5, Ice:0.5 },
  Fighting: { Normal:2, Ice:2, Poison:0.5, Flying:0.5, Psychic:0.5, Bug:0.5, Rock:2, Ghost:0, Dark:2, Steel:2, Fairy:0.5 },
  Poison: { Grass:2, Poison:0.5, Ground:0.5, Rock:0.5, Ghost:0.5, Steel:0, Fairy:2 },
  Ground: { Fire:2, Electric:2, Grass:0.5, Poison:2, Flying:0, Bug:0.5, Rock:2, Steel:2 },
  Flying: { Electric:0.5, Grass:2, Fighting:2, Bug:2, Rock:0.5, Steel:0.5 },
  Psychic: { Fighting:2, Poison:2, Psychic:0.5, Dark:0, Steel:0.5 },
  Bug: { Fire:0.5, Grass:2, Fighting:0.5, Poison:0.5, Flying:0.5, Psychic:2, Ghost:0.5, Dark:2, Steel:0.5, Fairy:0.5 },
  Rock: { Fire:2, Ice:2, Fighting:0.5, Ground:0.5, Flying:2, Bug:2, Steel:0.5 },
  Ghost: { Normal:0, Psychic:2, Ghost:2, Dark:0.5 },
  Dragon: { Dragon:2, Steel:0.5, Fairy:0 },
  Dark: { Fighting:0.5, Psychic:2, Ghost:2, Dark:0.5, Fairy:0.5 },
  Steel: { Fire:0.5, Water:0.5, Electric:0.5, Ice:2, Rock:2, Fairy:2, Steel:0.5 },
  Fairy: { Fire:0.5, Fighting:2, Poison:0.5, Dragon:2, Dark:2, Steel:0.5 },
};

export function mult(attacking: string, defendingTypes: string[]): number {
  const row = chart[attacking] || {};
  let m = 1;
  for (const dt of defendingTypes) {
    const v = row[dt] ?? 1;
    m *= v;
  }
  return m;
}

export function defenseSummary(rosterTypes: string[][]) {
  // For each attacking type, compute the worst-case multiplier across the roster.
  // (i.e., if any mon is weak, the team is considered weak to that type)
  const immune: string[] = [];
  const resist: string[] = [];
  const weak: string[] = [];
  for (const atk of TYPES) {
    let best = Infinity;
    let worst = 0;
    for (const def of rosterTypes) {
      const m = mult(atk, def);
      best = Math.min(best, m);
      worst = Math.max(worst, m);
    }
    if (best === 0) immune.push(atk);
    if (worst < 1) resist.push(atk);
    if (worst > 1) weak.push(atk);
  }
  return { immune, resist, weak };
}
