export type ApiErrorBody = {
  error?: string;
  message?: string;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, message: string, body: ApiErrorBody | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function resolveApiBaseUrl(): string {
  // Prefer relative proxy by default to avoid cookie host mismatches.
  // Only use NEXT_PUBLIC_API_BASE_URL if explicitly set.
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!env) return "/api";
  return env;
}

export async function apiFetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = resolveApiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    // Prefer the human-readable message; fall back to error code/name.
    const message =
      body?.message || body?.error || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}
