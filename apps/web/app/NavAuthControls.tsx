"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

export function NavAuthControls() {
  const { user, isLoading, logout } = useAuth();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  if (isLoading) {
    return null;
  }

  // Not logged in → show Login / Sign up
  if (!user) {
    return (
      <>
        <Link href="/login" className="btn btn-sm btn-secondary">
          Login
        </Link>
        <Link href="/register" className="btn btn-sm btn-primary">
          Sign up
        </Link>
      </>
    );
  }

  // Logged in → show greeting + Logout
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      toast.push({ kind: "info", title: "Logged out" });
      window.location.href = "/login";
    } catch {
      setLoggingOut(false);
    }
  }

  const label = user.displayName?.trim() || user.username;

  return (
    <>
      <span className="text-sm text-muted">Hi, {label}</span>
      <button
        onClick={handleLogout}
        className="btn btn-sm btn-ghost"
        disabled={loggingOut}
      >
        {loggingOut ? "Logging out..." : "Log out"}
      </button>
    </>
  );
}
