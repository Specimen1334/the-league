import AdmZip from "adm-zip";
import { mergePbsFiles, parsePbsText } from "./pbsParser";
import type { PbsDataset, PbsParsedFile } from "./pbsTypes";


function comparePbsFileNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();

  // Deterministic override behavior: base files first, override "pack" files last.
  const aIsOverride = la.includes("pack") || la.includes("gen_") || la.includes("override");
  const bIsOverride = lb.includes("pack") || lb.includes("gen_") || lb.includes("override");
  if (aIsOverride !== bIsOverride) return aIsOverride ? 1 : -1;

  return la.localeCompare(lb);
}


function pickFiles(zip: AdmZip, prefix: string): string[] {
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory)
    .map((e) => e.entryName)
    .filter((n) => {
      const lower = n.toLowerCase();
      return lower.endsWith(".txt") && lower.includes(prefix);
    })
    .sort(comparePbsFileNames);
  return entries;
}

function readAndParse(zip: AdmZip, names: string[]): PbsParsedFile {
  const parsed: PbsParsedFile[] = [];
  for (const name of names) {
    const e = zip.getEntry(name);
    if (!e) continue;
    const text = zip.readAsText(e, "utf8");
    parsed.push(parsePbsText(text));
  }
  return mergePbsFiles(parsed);
}

function parsePokemonPointsCsv(csv: string): Map<string, number> {
  // Expected header: slug,points
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out = new Map<string, number>();
  if (lines.length === 0) return out;

  // Identify column indices (supports reordered columns)
  const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
  const slugIdx = header.indexOf("slug");
  const pointsIdx = header.indexOf("points");

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const slug = (cols[slugIdx] ?? "").trim();
    const pointsRaw = (cols[pointsIdx] ?? "").trim();
    if (!slug || !pointsRaw) continue;

    const points = Number(pointsRaw);
    if (!Number.isFinite(points)) continue;

    out.set(slug.toLowerCase(), points);
  }

  return out;
}

export function loadPbsDatasetFromZip(buffer: Buffer): PbsDataset {
  const zip = new AdmZip(buffer);

  const pokemonFiles = pickFiles(zip, "pokemon").filter(
    (n) => n.toLowerCase().includes("pokemon") && !n.toLowerCase().includes("forms")
  );
  const formsFiles = pickFiles(zip, "pokemon_forms");
  const movesFiles = pickFiles(zip, "moves");
  const abilitiesFiles = pickFiles(zip, "abilities");
  const itemsFiles = pickFiles(zip, "items");
  const typesFiles = pickFiles(zip, "types");

  // Fallback: if pokemon_forms files are named differently, search by "forms"
  const formsAlt =
    formsFiles.length === 0
      ? zip
          .getEntries()
          .filter((e) => !e.isDirectory)
          .map((e) => e.entryName)
          .filter(
            (n) =>
              n.toLowerCase().endsWith(".txt") &&
              n.toLowerCase().includes("forms") &&
              n.toLowerCase().includes("pokemon")
          )
          .sort()
      : formsFiles;

  // pokemon_points.csv is the canonical source of base_cost (draft points)
  let pokemonPoints = new Map<string, number>();
  const pointsEntry = zip
    .getEntries()
    .filter((e) => !e.isDirectory)
    .find((e) => e.entryName.toLowerCase().endsWith("pokemon_points.csv"));
  if (pointsEntry) {
    const csv = zip.readAsText(pointsEntry, "utf8");
    pokemonPoints = parsePokemonPointsCsv(csv);
  }

  return {
    pokemon: readAndParse(zip, pokemonFiles),
    forms: readAndParse(zip, formsAlt),
    moves: readAndParse(zip, movesFiles),
    abilities: readAndParse(zip, abilitiesFiles),
    items: readAndParse(zip, itemsFiles),
    types: readAndParse(zip, typesFiles),
    pokemonPoints
  };
}
