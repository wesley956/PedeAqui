"use client";

import { useEffect, useId, useRef } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "pedeaqui-theme";
const darkModeQuery = "(prefers-color-scheme: dark)";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function systemTheme(): "light" | "dark" {
  return window.matchMedia(darkModeQuery).matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference) {
  const resolved = preference === "system" ? systemTheme() : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
}

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
    const initial = isThemePreference(stored) ? stored : "system";
    if (selectRef.current) selectRef.current.value = initial;
    applyTheme(initial);

  }, []);

  function handleChange(value: ThemePreference) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // The choice still applies for the current page when storage is unavailable.
    }
    applyTheme(value);
  }

  return (
    <div className={`theme-selector ${compact ? "theme-selector-compact" : "theme-selector-card"}`}>
      <label className="theme-selector-field" htmlFor={id}>
        <span className="theme-selector-label">Tema</span>
        <select
          id={id}
          ref={selectRef}
          className="theme-selector-select"
          defaultValue="system"
          onChange={(event) => handleChange(event.target.value as ThemePreference)}
          aria-label={compact ? "Tema da interface" : undefined}
        >
          <option value="system">Automático</option>
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </label>
      {!compact ? <p className="theme-selector-help">Automático acompanha a preferência de aparência do seu aparelho.</p> : null}
    </div>
  );
}
