// apps/web/kit/api.ts

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      text ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function postAction<T = any>(path: string, body?: any): Promise<T> {
  return fetchJSON<T>(`${API_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
