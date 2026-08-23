"use client";

import { useState } from "react";
import styles from "./public-theme-cycle-button.module.css";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "pedeaqui-theme";

const labels: Record<ThemePreference, string> = {
  system: "Automático",
  light: "Claro",
  dark: "Escuro",
};

const icons: Record<ThemePreference, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

function isThemePreference(value: string | undefined | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function nextTheme(preference: ThemePreference): ThemePreference {
  if (preference === "system") return "light";
  if (preference === "light") return "dark";
  return "system";
}

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function currentThemePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const current = document.documentElement.dataset.themePreference;
  return isThemePreference(current) ? current : "system";
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === "system" ? systemTheme() : preference;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Theme still applies for the current page even if storage is unavailable.
  }
}

export function PublicThemeCycleButton() {
  const [preference, setPreference] = useState<ThemePreference>(currentThemePreference);

  function cycleTheme() {
    const next = nextTheme(preference);
    applyTheme(next);
    setPreference(next);
  }

  const next = nextTheme(preference);
  const label = `Tema: ${labels[preference]}. Toque para mudar para ${labels[next]}.`;

  return (
    <button
      type="button"
      className={styles.button}
      data-mode={preference}
      onClick={cycleTheme}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className={styles.icon}>{icons[preference]}</span>
    </button>
  );
}
