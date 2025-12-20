import { dbFile } from "../../db";
import { loadPbsDatasetFromZip } from "./pbs/pbsImporter";

export type PokedexImportReport = {
  dryRun: boolean;
  sourceTag: string;
  counts: {
    pokemonEntries: number;
    draftableEntries: number;
    moves: number;
    abilities: number;
    items: number;
    types: number;
    evolutions: number;
    learnsets: number;
    pokemonAbilitySlots: number;
    natures: number;
  };
  warnings: string[];
  missingDraftables: string[];
  battleOnlyFormsExcluded: number;
};

function parseCsvList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseLevelMoves(v: string | undefined): Array<{ level: number; move: string }> {
  if (!v) return [];
  const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
  const out: Array<{ level: number; move: string }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const level = Number(parts[i]);
    const move = parts[i + 1];
    if (!Number.isFinite(level) || level < 0 || !move) continue;
    out.push({ level, move });
  }
  return out;
}

function parseDexNumber(v: string | undefined): number {
  if (!v) return 0;
  const m = v.match(/\d+/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : 0;
}


function pointsSlug(name: string, formName: string | null): string {
  const base = formName && formName.trim().length > 0 ? `${name}-${formName}` : name;
  return base
    .trim()
    .toLowerCase()
    .replace(/[’`']/g, "")
    .replace(/♀/g, "female")
    .replace(/♂/g, "male")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}


function getField(fields: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = fields[k];
    if (v != null && String(v).trim().length > 0) return String(v);
  }
  return undefined;
}

function parseTypesFromFields(fields: Record<string, string>): string[] {
  const typesCsv = getField(fields, ["Types"]);
  if (typesCsv) {
    const t = parseCsvList(typesCsv);
    const out: string[] = [];
    for (const x of t) {
      if (!out.includes(x)) out.push(x);
    }
    return out;
  }
  const type1 = (getField(fields, ["Type1"]) ?? "").trim();
  const type2 = (getField(fields, ["Type2"]) ?? "").trim();
  const out: string[] = [];
  if (type1) out.push(type1);
  if (type2 && type2 !== type1) out.push(type2);
  return out;
}

function parseDexNumberFromFields(fields: Record<string, string>): number {
  const v = getField(fields, ["DexNumber", "DexNumbers", "RegionalDexNumber", "RegionalDexNumbers"]);
  return parseDexNumber(v);
}


function buildSpriteUrl(speciesKey: string, formKeyNorm: string): string {
  const base = speciesKey.trim().toUpperCase();
  const suffix = formKeyNorm && formKeyNorm.trim().length > 0 ? `_${formKeyNorm.trim()}` : "";
  return `/assets/pokemon/${base}${suffix}.png`;
}

function formKeyNormFromSectionId(id: string): string {
  const parts = id.split(",").map((p) => p.trim());
  if (parts.length <= 1) return "";
  return parts.slice(1).join(",");
}

type DexPokemonRow = {
  speciesKey: string;
  formKey: string | null;
  formKeyNorm: string;
  name: string;
  formName: string | null;
  baseCost: number | null;
  dexNumber: number;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  isBattleOnlyForm: boolean;
  isDraftableDefault: boolean;
  abilities: { ability1?: string; ability2?: string; hidden?: string };
  evolutions: Array<{ toSpeciesKey: string; method: string; param?: string }>;
  learnset: { levelUp: Array<{ level: number; move: string }>; egg: string[]; tutor: string[] };
};

function buildDexRowsFromDataset(dataset: ReturnType<typeof loadPbsDatasetFromZip>): {
  rows: DexPokemonRow[];
  warnings: string[];
  battleOnlyFormsExcluded: number;
} {
  const warnings: string[] = [];
  const rows: DexPokemonRow[] = [];
  let battleOnlyFormsExcluded = 0;

  // Base species
  for (const [id, sec] of dataset.pokemon.sections.entries()) {
    const speciesKey = id.split(",")[0].trim();
    const formKeyNorm = formKeyNormFromSectionId(id);
    if (formKeyNorm !== "") continue; // only base species here

    const name = sec.fields["Name"] ?? titleCase(speciesKey);
    const formName = sec.fields["FormName"] ? sec.fields["FormName"].trim() : null;

    const types = parseTypesFromFields(sec.fields);
    const baseStatsParts = (sec.fields["BaseStats"] ?? "")
      .split(",")
      .map((x) => Number(x.trim()));
    const baseStats = {
      hp: baseStatsParts[0] ?? 0,
      atk: baseStatsParts[1] ?? 0,
      def: baseStatsParts[2] ?? 0,
      spa: baseStatsParts[3] ?? 0,
      spd: baseStatsParts[4] ?? 0,
      spe: baseStatsParts[5] ?? 0
    };

    const abilities = parseCsvList(sec.fields["Abilities"]);
    const hidden = (sec.fields["HiddenAbility"] ?? sec.fields["HiddenAbilities"] ?? "").trim();

    const isBattleOnlyForm = false;
    const baseCost = dataset.pokemonPoints.get(pointsSlug(name, formName)) ?? null;
    const isDraftableDefault = baseCost !== null && !isBattleOnlyForm;

    if (isBattleOnlyForm) {
      battleOnlyFormsExcluded += 1;
      continue;
    }

    rows.push({
      speciesKey,
      formKey: null,
      formKeyNorm: "",
      name,
      formName,
      baseCost,
      dexNumber: parseDexNumberFromFields(sec.fields),
      types,
      baseStats,
      isBattleOnlyForm,
      isDraftableDefault,
      abilities: {
        ability1: abilities[0],
        ability2: abilities[1],
        hidden: hidden || undefined
      },
      evolutions: parseEvolutions(sec.fields["Evolutions"]),
      learnset: {
        levelUp: parseLevelMoves(sec.fields["Moves"]),
        egg: parseCsvList(sec.fields["EggMoves"]),
        tutor: parseCsvList(sec.fields["TutorMoves"])
      }
    });
  }

  // Forms / overrides
  for (const [id, sec] of dataset.forms.sections.entries()) {
    const parts = id.split(",").map((p) => p.trim());
    const speciesKey = parts[0] ?? "";
    if (!speciesKey) continue;
    const formKeyNorm = formKeyNormFromSectionId(id);

    const base = dataset.pokemon.sections.get(speciesKey);
    if (!base) {
      warnings.push(`Form section [${id}] has no base species section [${speciesKey}] in pokemon files.`);
      continue;
    }

    const mergedFields = { ...base.fields, ...sec.fields };
    const baseName = mergedFields["Name"] ?? titleCase(speciesKey);
    const formName = mergedFields["FormName"] ? mergedFields["FormName"].trim() : null;

    const types = parseTypesFromFields(mergedFields);
    const baseStatsParts = (mergedFields["BaseStats"] ?? "")
      .split(",")
      .map((x) => Number(x.trim()));
    const baseStats = {
      hp: baseStatsParts[0] ?? 0,
      atk: baseStatsParts[1] ?? 0,
      def: baseStatsParts[2] ?? 0,
      spa: baseStatsParts[3] ?? 0,
      spd: baseStatsParts[4] ?? 0,
      spe: baseStatsParts[5] ?? 0
    };

    const abilities = parseCsvList(mergedFields["Abilities"]);
    const hidden = (mergedFields["HiddenAbility"] ?? mergedFields["HiddenAbilities"] ?? "").trim();

    const megaStone = (mergedFields["MegaStone"] ?? "").trim();
    const isBattleOnlyForm = megaStone.length > 0 || (formName ? formName.toLowerCase().includes("mega") : false);
    const baseCost = dataset.pokemonPoints.get(pointsSlug(baseName, formName)) ?? null;
    const isDraftableDefault = baseCost !== null && !isBattleOnlyForm;

    if (isBattleOnlyForm) {
      battleOnlyFormsExcluded += 1;
      continue;
    }

    rows.push({
      speciesKey,
      formKey: formKeyNorm,
      formKeyNorm,
      name: baseName,
      formName,
      baseCost,
      dexNumber: parseDexNumberFromFields(mergedFields),
      types,
      baseStats,
      isBattleOnlyForm,
      isDraftableDefault,
      abilities: {
        ability1: abilities[0],
        ability2: abilities[1],
        hidden: hidden || undefined
      },
      evolutions: parseEvolutions(mergedFields["Evolutions"]),
      learnset: {
        levelUp: parseLevelMoves(mergedFields["Moves"]),
        egg: parseCsvList(mergedFields["EggMoves"]),
        tutor: parseCsvList(mergedFields["TutorMoves"])
      }
    });
  }

  return { rows, warnings, battleOnlyFormsExcluded };
}

function parseEvolutions(v: string | undefined): Array<{ toSpeciesKey: string; method: string; param?: string }> {
  if (!v) return [];
  const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
  const out: Array<{ toSpeciesKey: string; method: string; param?: string }> = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const to = parts[i];
    const method = parts[i + 1];
    const param = parts[i + 2];
    if (!to || !method) continue;
    out.push({ toSpeciesKey: to, method, param });
  }
  return out;
}

function titleCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function importPbsZipToDex(opts: {
  buffer: Buffer;
  dryRun: boolean;
  sourceTag?: string;
}): PokedexImportReport {
  const sourceTag = (opts.sourceTag ?? "pbs").trim() || "pbs";
  const dataset = loadPbsDatasetFromZip(opts.buffer);
  const { rows, warnings, battleOnlyFormsExcluded } = buildDexRowsFromDataset(dataset);

  const missingDraftables: string[] = [];

  for (const r of rows) {
    if (r.isBattleOnlyForm) continue;
    if (r.baseCost === null) {
      missingDraftables.push(pointsSlug(r.name, r.formName));
    }
  }

  missingDraftables.sort();

  const report: PokedexImportReport = {
    dryRun: opts.dryRun,
    sourceTag,
    counts: {
      pokemonEntries: rows.length,
      draftableEntries: rows.filter((r) => r.isDraftableDefault).length,
      moves: dataset.moves.sections.size,
      abilities: dataset.abilities.sections.size,
      items: dataset.items.sections.size,
      types: dataset.types.sections.size,
      evolutions: rows.reduce((acc, r) => acc + r.evolutions.length, 0),
      learnsets: rows.length,
      pokemonAbilitySlots: rows.reduce(
        (acc, r) =>
          acc +
          (r.abilities.ability1 ? 1 : 0) +
          (r.abilities.ability2 ? 1 : 0) +
          (r.abilities.hidden ? 1 : 0),
        0
      ),
      natures: 25
    },
    warnings,
    missingDraftables
  };

  if (opts.dryRun) return report;

  const now = new Date().toISOString();

  const tx = dbFile.transaction(() => {
    // Replace dex reference data
    dbFile.exec("DELETE FROM dex_moves;");
    dbFile.exec("DELETE FROM dex_abilities;");
    dbFile.exec("DELETE FROM dex_items;");
    dbFile.exec("DELETE FROM dex_types;");
    dbFile.exec("DELETE FROM dex_natures;");
    dbFile.exec("DELETE FROM dex_pokemon_abilities;");
    dbFile.exec("DELETE FROM dex_pokemon_evolutions;");
    dbFile.exec("DELETE FROM dex_pokemon_learnsets;");

    // Moves
    {
      const stmt = dbFile.prepare(`
        INSERT INTO dex_moves (
          key, name, type, category, power, accuracy, pp, priority, target,
          function_code, effect_chance, flags, description
        ) VALUES (
          @key, @name, @type, @category, @power, @accuracy, @pp, @priority, @target,
          @function_code, @effect_chance, @flags, @description
        );
      `);
      for (const [key, sec] of dataset.moves.sections.entries()) {
        stmt.run({
          key,
          name: sec.fields["Name"] ?? key,
          type: sec.fields["Type"] ?? null,
          category: sec.fields["Category"] ?? null,
          power: numOrNull(sec.fields["Power"]),
          accuracy: numOrNull(sec.fields["Accuracy"]),
          pp: numOrNull(sec.fields["PP"]),
          priority: numOrNull(sec.fields["Priority"]),
          target: sec.fields["Target"] ?? null,
          function_code: sec.fields["Function"] ?? null,
          effect_chance: numOrNull(sec.fields["EffectChance"]),
          flags: sec.fields["Flags"] ?? null,
          description: sec.fields["Description"] ?? null
        });
      }
    }

    // Abilities
    {
      const stmt = dbFile.prepare(
        `INSERT INTO dex_abilities (key, name, description) VALUES (@key, @name, @description);`
      );
      for (const [key, sec] of dataset.abilities.sections.entries()) {
        stmt.run({
          key,
          name: sec.fields["Name"] ?? key,
          description: sec.fields["Description"] ?? null
        });
      }
    }


    // Items
    {
      const stmt = dbFile.prepare(
        `INSERT INTO dex_items (key, name, description, pocket, flags)
         VALUES (@key, @name, @description, @pocket, @flags);`
      );
      for (const [key, sec] of dataset.items.sections.entries()) {
        stmt.run({
          key,
          name: sec.fields["Name"] ?? key,
          description: sec.fields["Description"] ?? null,
          pocket: sec.fields["Pocket"] ?? null,
          flags: sec.fields["Flags"] ?? null
        });
      }
    }

    // Types
    {
      const stmt = dbFile.prepare(
        `INSERT INTO dex_types (key, name, damage_relations_json) VALUES (@key, @name, @damage_relations_json);`
      );
      for (const [key, sec] of dataset.types.sections.entries()) {
        stmt.run({
          key,
          name: sec.fields["Name"] ?? key,
          damage_relations_json: JSON.stringify(sec.fields)
        });
      }
    }

    // Natures seed
    seedNatures();

    // Upsert pokemon entries
    const selectExisting = dbFile.prepare(
      `SELECT id FROM pokedex_entries WHERE species_key = ? AND form_key_norm = ? LIMIT 1;`
    );
    const insertPokemon = dbFile.prepare(`
      INSERT INTO pokedex_entries (
        dex_number, form_name, name, base_cost, override_cost, sprite_url,
        base_stats_json, roles_json, tags_json, types_json,
        species_key, form_key, form_key_norm, is_draftable_default, is_battle_only_form,
        is_archived, imported_at, source_tag
      ) VALUES (
        @dex_number, @form_name, @name, @base_cost, NULL, @sprite_url,
        @base_stats_json, NULL, NULL, @types_json,
        @species_key, @form_key, @form_key_norm, @is_draftable_default, @is_battle_only_form,
        0, @imported_at, @source_tag
      );
    `);
    const updatePokemon = dbFile.prepare(`
      UPDATE pokedex_entries SET
        dex_number=@dex_number,
        form_name=@form_name,
        name=@name,
        sprite_url=@sprite_url,
        base_stats_json=@base_stats_json,
        types_json=@types_json,
        species_key=@species_key,
        form_key=@form_key,
        form_key_norm=@form_key_norm,
        is_draftable_default=@is_draftable_default,
        is_battle_only_form=@is_battle_only_form,
        is_archived=0,
        imported_at=@imported_at,
        source_tag=@source_tag
      WHERE id=@id;
    `);

    const upsertedIds: number[] = [];

    for (const r of rows) {
      const existing = selectExisting.get(r.speciesKey, r.formKeyNorm) as any;
      const payload = {
        id: existing?.id,
        dex_number: r.dexNumber,
        form_name: r.formName,
        name: r.formName ? `${r.name} (${r.formName})` : r.name,
        sprite_url: buildSpriteUrl(r.speciesKey, r.formKeyNorm),
        base_cost: r.baseCost,
        base_stats_json: JSON.stringify(r.baseStats),
        types_json: JSON.stringify(r.types),
        species_key: r.speciesKey,
        form_key: r.formKey,
        form_key_norm: r.formKeyNorm,
        is_draftable_default: r.isDraftableDefault ? 1 : 0,
        is_battle_only_form: r.isBattleOnlyForm ? 1 : 0,
        imported_at: now,
        source_tag: sourceTag
      };

      if (existing?.id) {
        updatePokemon.run(payload);
        upsertedIds.push(existing.id);
      } else {
        const res = insertPokemon.run(payload) as any;
        upsertedIds.push(Number(res.lastInsertRowid));
      }
    }

    // Archive pokemon not in this import
    if (upsertedIds.length > 0) {
      const placeholders = upsertedIds.map(() => "?").join(",");
      dbFile
        .prepare(
          `UPDATE pokedex_entries SET is_archived=1 WHERE species_key IS NOT NULL AND id NOT IN (${placeholders});`
        )
        .run(...upsertedIds);
    }

    // Build mapping from species+form to pokedex_entries.id
    const idRows = dbFile
      .prepare(`SELECT id, species_key, form_key_norm FROM pokedex_entries WHERE species_key IS NOT NULL;`)
      .all() as any[];
    const idMap = new Map<string, number>();
    for (const r of idRows) {
      idMap.set(`${r.species_key}::${r.form_key_norm ?? ""}`, r.id);
    }

    // Insert learnsets + abilities + evolutions
    const learnStmt = dbFile.prepare(
      `INSERT INTO dex_pokemon_learnsets (pokemon_id, level_up_json, egg_moves_json, tutor_moves_json)
       VALUES (@pokemon_id, @level_up_json, @egg_moves_json, @tutor_moves_json);`
    );
    const abilStmt = dbFile.prepare(
      `INSERT INTO dex_pokemon_abilities (pokemon_id, slot, ability_key) VALUES (@pokemon_id, @slot, @ability_key);`
    );
    const evoStmt = dbFile.prepare(
      `INSERT INTO dex_pokemon_evolutions (from_pokemon_id, to_pokemon_id, method, param)
       VALUES (@from_pokemon_id, @to_pokemon_id, @method, @param);`
    );

    for (const r of rows) {
      const fromId = idMap.get(`${r.speciesKey}::${r.formKeyNorm}`);
      if (!fromId) continue;

      learnStmt.run({
        pokemon_id: fromId,
        level_up_json: JSON.stringify(r.learnset.levelUp),
        egg_moves_json: JSON.stringify(r.learnset.egg),
        tutor_moves_json: JSON.stringify(r.learnset.tutor)
      });

      if (r.abilities.ability1) {
        abilStmt.run({ pokemon_id: fromId, slot: "ability1", ability_key: r.abilities.ability1 });
      }
      if (r.abilities.ability2) {
        abilStmt.run({ pokemon_id: fromId, slot: "ability2", ability_key: r.abilities.ability2 });
      }
      if (r.abilities.hidden) {
        abilStmt.run({ pokemon_id: fromId, slot: "hidden", ability_key: r.abilities.hidden });
      }

      for (const evo of r.evolutions) {
        const toId = idMap.get(`${evo.toSpeciesKey}::`);
        if (!toId) continue;
        evoStmt.run({
          from_pokemon_id: fromId,
          to_pokemon_id: toId,
          method: evo.method,
          param: evo.param ?? null
        });
      }
    }
  });

  tx();
  return report;
}

function numOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

function seedNatures(): void {
  const natures = getStandardNatures();
  const stmt = dbFile.prepare(
    `INSERT INTO dex_natures (key, name, increased_stat, decreased_stat, description)
     VALUES (@key, @name, @inc, @dec, NULL);`
  );
  for (const n of natures) {
    stmt.run({ key: n.key, name: n.name, inc: n.increased ?? null, dec: n.decreased ?? null });
  }
}

function getStandardNatures(): Array<{ key: string; name: string; increased?: string; decreased?: string }> {
  return [
    { key: "HARDY", name: "Hardy" },
    { key: "LONELY", name: "Lonely", increased: "Attack", decreased: "Defense" },
    { key: "BRAVE", name: "Brave", increased: "Attack", decreased: "Speed" },
    { key: "ADAMANT", name: "Adamant", increased: "Attack", decreased: "Sp. Atk" },
    { key: "NAUGHTY", name: "Naughty", increased: "Attack", decreased: "Sp. Def" },
    { key: "BOLD", name: "Bold", increased: "Defense", decreased: "Attack" },
    { key: "DOCILE", name: "Docile" },
    { key: "RELAXED", name: "Relaxed", increased: "Defense", decreased: "Speed" },
    { key: "IMPISH", name: "Impish", increased: "Defense", decreased: "Sp. Atk" },
    { key: "LAX", name: "Lax", increased: "Defense", decreased: "Sp. Def" },
    { key: "TIMID", name: "Timid", increased: "Speed", decreased: "Attack" },
    { key: "HASTY", name: "Hasty", increased: "Speed", decreased: "Defense" },
    { key: "SERIOUS", name: "Serious" },
    { key: "JOLLY", name: "Jolly", increased: "Speed", decreased: "Sp. Atk" },
    { key: "NAIVE", name: "Naive", increased: "Speed", decreased: "Sp. Def" },
    { key: "MODEST", name: "Modest", increased: "Sp. Atk", decreased: "Attack" },
    { key: "MILD", name: "Mild", increased: "Sp. Atk", decreased: "Defense" },
    { key: "QUIET", name: "Quiet", increased: "Sp. Atk", decreased: "Speed" },
    { key: "BASHFUL", name: "Bashful" },
    { key: "RASH", name: "Rash", increased: "Sp. Atk", decreased: "Sp. Def" },
    { key: "CALM", name: "Calm", increased: "Sp. Def", decreased: "Attack" },
    { key: "GENTLE", name: "Gentle", increased: "Sp. Def", decreased: "Defense" },
    { key: "SASSY", name: "Sassy", increased: "Sp. Def", decreased: "Speed" },
    { key: "CAREFUL", name: "Careful", increased: "Sp. Def", decreased: "Sp. Atk" },
    { key: "QUIRKY", name: "Quirky" }
  ];
}

