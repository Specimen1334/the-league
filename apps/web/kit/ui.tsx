"use client";
import React from "react";

/* ---------- Card ---------- */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card/90 backdrop-blur px-4 py-3 min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-3 min-w-0">{children}</div>
    </div>
  );
}

/* ---------- NumberField ---------- */
export function NumberField({
  label, value, min, max, onChange, quick, step = 1, snap, snapMode = "immediate", error,
}: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; quick?: number[]; step?: number;
  snap?: number; snapMode?: "immediate" | "onBlur"; error?: string;
}) {
  const [text, setText] = React.useState(String(value));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => { if (!focused) setText(String(value)); }, [value, focused]);

  const clampNum = (n: number) => Math.max(min, Math.min(max, n));
  const snapNum = (n: number) => (snap ? Math.round(n / snap) * snap : n);
  const commit = (raw: number) => {
    const committed = clampNum(snap ? snapNum(raw) : raw);
    setText(String(committed));
    onChange(committed);
  };

  return (
    <div className={`bg-white/5 border rounded-lg p-2 ${error ? "border-red-400/60" : "border-white/10"}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="number"
          step={step}
          className="w-full bg-surface-2 rounded-md px-2 py-1 outline-none border border-white/10"
          min={min}
          max={max}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const n = Number(text);
            commit(Number.isFinite(n) ? n : value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = Number(text);
              commit(Number.isFinite(n) ? n : value);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setText(String(value));
              (e.target as HTMLInputElement).blur();
            }
          }}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const n = Number(next);
            if (snapMode === "immediate") {
              if (Number.isFinite(n)) commit(n);
            }
          }}
        />
        {quick?.map(v => (
          <button
            key={v}
            className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20"
            onClick={() => commit(v)}
            type="button"
          >
            {v}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-400" aria-live="polite">{error}</p>}
    </div>
  );
}

/* ---------- TypeBadge ---------- */
const tone: Record<string, string> = {
  GRASS:"bg-emerald-600/90 text-white", FIRE:"bg-rose-600/90 text-white", WATER:"bg-sky-600/90 text-white",
  ELECTRIC:"bg-amber-500/90 text-black", ICE:"bg-cyan-500/90 text-black", FIGHTING:"bg-orange-700/90 text-white",
  POISON:"bg-fuchsia-700/90 text-white", GROUND:"bg-yellow-700/90 text-white", FLYING:"bg-indigo-600/90 text-white",
  PSYCHIC:"bg-pink-600/90 text-white", BUG:"bg-lime-700/90 text-white", ROCK:"bg-stone-600/90 text-white",
  GHOST:"bg-violet-700/90 text-white", DRAGON:"bg-indigo-800/90 text-white", DARK:"bg-zinc-800/90 text-white",
  STEEL:"bg-slate-500/90 text-white", FAIRY:"bg-rose-400/90 text-black", NORMAL:"bg-neutral-500/90 text-white",
};

export function TypeBadge({ t }: { t: string }) {
  const cls = tone[(t || "").toUpperCase()] || "bg-zinc-600/90 text-white";
  return <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold tracking-wide ${cls}`}>{(t||"").toUpperCase()}</span>;
}

/* ---------- Stat ---------- */
export function Stat({ label, v }: { label: string; v?: number }) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-1 text-center">
      <div className="text-[10px] opacity-70">{label}</div>
      <div className="font-semibold">{v ?? "—"}</div>
    </div>
  );
}

/* ---------- Filters ---------- */
export function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="opacity-80">{label}</span>
      {children}
    </label>
  );
}

export function Filters({
  filters, onChange, onSearch,
}: { filters: any; onChange: (f: any) => void; onSearch: () => void }) {
  const field =
    "px-3 py-2 rounded-xl bg-white text-black placeholder-black/60 outline-none border border-black/10 " +
    "focus:ring-2 focus:ring-black/20 focus:border-black/20";
  const selectCls =
    "px-3 py-2 rounded-xl bg-white text-black outline-none border border-black/10 " +
    "focus:ring-2 focus:ring-black/20 focus:border-black/20";

  return (
    <form
      className="grid gap-2 md:grid-cols-3 xl:grid-cols-4 bg-surface-2/60 backdrop-blur-sm p-2 rounded-xl"
      onSubmit={(e) => { e.preventDefault(); onSearch(); }}
    >
      <L label="Search">
        <input
          aria-label="Search name"
          className={field}
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="e.g. Garchomp"
          autoComplete="off"
        />
      </L>

      <L label="Type (any)">
        <input
          placeholder="e.g. Water,Rock"
          className={field}
          value={filters.type}
          onChange={(e) => onChange({ ...filters, type: e.target.value })}
          autoComplete="off"
        />
      </L>

      <L label="Ability (any)">
        <input
          placeholder="e.g. Intimidate,Levitate"
          className={field}
          value={filters.ability}
          onChange={(e) => onChange({ ...filters, ability: e.target.value })}
          autoComplete="off"
        />
      </L>

      <L label="Move (any)">
        <input
          placeholder="e.g. Stealth Rock,U-turn"
          className={field}
          value={filters.move}
          onChange={(e) => onChange({ ...filters, move: e.target.value })}
          autoComplete="off"
        />
      </L>

      <L label="Min Cost (pts)">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="e.g. 1"
          className={field}
          value={filters.minPoints}
          onChange={(e) => onChange({ ...filters, minPoints: e.target.value })}
        />
      </L>

      <L label="Max Cost (pts)">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="e.g. 19"
          className={field}
          value={filters.maxPoints}
          onChange={(e) => onChange({ ...filters, maxPoints: e.target.value })}
        />
      </L>

      <L label="Sort">
        <select
          className={selectCls}
          value={filters.sortKey}
          onChange={(e) => onChange({ ...filters, sortKey: e.target.value })}
        >
          <option value="dex">Pokédex #</option>
          <option value="pts">Draft Value (pts)</option>
          <option value="spe">Speed</option>
          <option value="spa">Sp. Atk</option>
          <option value="spd">Sp. Def</option>
          <option value="atk">Attack</option>
          <option value="def">Defense</option>
          <option value="hp">HP</option>
          <option value="name">Name</option>
        </select>
      </L>

      <L label="Direction">
        <select
          className={selectCls}
          value={filters.sortDir}
          onChange={(e) => onChange({ ...filters, sortDir: e.target.value })}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </L>

      <label className="flex items-center gap-2 text-sm mt-1 md:col-span-2 xl:col-span-3">
        <input
          type="checkbox"
          checked={filters.hideDrafted}
          onChange={(e) => onChange({ ...filters, hideDrafted: e.target.checked })}
          className="h-4 w-4 accent-black"
        />
        <span>Hide drafted</span>
      </label>

      <div className="flex items-end">
        <button
          type="submit"
          className="px-3 py-2 rounded-xl bg-brand text-black hover:brightness-110"
        >
          Search
        </button>
      </div>
    </form>
  );
}
