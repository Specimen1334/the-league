"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetchJson, ApiError } from "./api";

export type AuthUser = {
  id: number;
  username: string;
  displayName?: string | null;
  email?: string | null;
  role: string;
  createdAt: string;
};

type MeResponse = {
  user: AuthUser | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetchJson<MeResponse>("/auth/me");
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null);
      } else {
        // Network / server error → treat as logged out for UI consistency.
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetchJson<{ ok?: boolean }>("/auth/logout", { method: "POST" });
    } catch {
      // Ignore; we'll still clear local auth state.
    }
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, refresh, setUser, logout }),
    [user, isLoading, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
