// apps/api/src/shared/validation.ts

/**
 * Parse a numeric query or body field into a number with sane defaults.
 */
export function parseNumber(
  raw: unknown,
  options: { defaultValue?: number; min?: number; max?: number } = {}
): number {
  const { defaultValue = 0, min, max } = options;
  const n = Number(raw);
  if (Number.isNaN(n)) return defaultValue;

  let value = n;
  if (typeof min === "number") value = Math.max(min, value);
  if (typeof max === "number") value = Math.min(max, value);
  return value;
}

/**
 * Trim and normalise a string; returns undefined if empty.
 */
export function parseOptionalString(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Ensure a value is one of the allowed string literals.
 */
export function parseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  options: { defaultValue?: T } = {}
): T | undefined {
  if (typeof raw !== "string") return options.defaultValue;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : options.defaultValue;
}

/**
 * Shallow-merge two JSON-serialisable objects and return a stringified version.
 */
export function mergeJson<T extends object>(
  base: T | null | undefined,
  patch: Partial<T>
): string {
  const safeBase = base ?? ({} as T);
  const merged = { ...safeBase, ...patch } as T;
  return JSON.stringify(merged);
}

/**
 * Safely parse JSON from a DB TEXT column (settings, etc.).
 */
export function safeParseJson<T extends object>(raw: unknown): T {
  if (typeof raw !== "string" || !raw.trim()) {
    return {} as T;
  }
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}
