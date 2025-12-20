import type { PbsParsedFile, PbsSection } from "./pbsTypes";

function isCommentOrEmpty(line: string): boolean {
  const t = line.trim();
  return t.length === 0 || t.startsWith("#") || t.startsWith(";");
}

function normalizeFieldKey(key: string): string {
  return key.trim();
}

/**
 * Parses Essentials-style PBS text into sections.
 *
 * Rules:
 * - New section starts at: [SECTION]
 * - Field line: Key = Value
 * - Comments start with # or ;
 * - Duplicate keys in a section: later wins
 */
export function parsePbsText(text: string): PbsParsedFile {
  const sections = new Map<string, PbsSection>();
  let current: PbsSection | null = null;

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    if (isCommentOrEmpty(raw)) continue;

    const line = raw.trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      const id = line.slice(1, -1).trim();
      current = { id, fields: {} };
      sections.set(id, current);
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1 || !current) continue;
    const key = normalizeFieldKey(line.slice(0, eq));
    const value = line.slice(eq + 1).trim();
    current.fields[key] = value;
  }

  return { sections };
}

/**
 * Merge PBS files where later files override earlier ones by section+field.
 */
export function mergePbsFiles(files: PbsParsedFile[]): PbsParsedFile {
  const merged = new Map<string, PbsSection>();

  for (const file of files) {
    for (const [id, sec] of file.sections.entries()) {
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, { id, fields: { ...sec.fields } });
        continue;
      }
      merged.set(id, { id, fields: { ...existing.fields, ...sec.fields } });
    }
  }

  return { sections: merged };
}
