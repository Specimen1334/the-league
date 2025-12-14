"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "the-league-theme";

const THEME_OPTIONS = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "neon-gamer", label: "Neon gamer" },
  { id: "gothic", label: "Gothic" },
  { id: "pastel", label: "Pastel" },
  { id: "system", label: "System default" }
] as const;

type ThemeId = (typeof THEME_OPTIONS)[number]["id"];

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("system");

  // On mount: load saved theme and apply it
  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = (window.localStorage.getItem(STORAGE_KEY) ||
      "system") as ThemeId;

    applyTheme(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTheme(next: ThemeId) {
    setTheme(next);

    if (typeof document === "undefined") return;

    const prefersDark = window.matchMedia?.(
      "(prefers-color-scheme: dark)"
    ).matches;

    const effective =
      next === "system" ? (prefersDark ? "dark" : "light") : next;

    document.body.dataset.theme = effective;
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="field-row field-row--middle">
      <span className="text-xs text-muted">Theme</span>
      <select
        className="input input-xs"
        value={theme}
        onChange={(e) => applyTheme(e.target.value as ThemeId)}
      >
        {THEME_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
