"use client";

import { useEffect, useState } from "react";
import styles from "./public-theme-cycle-button.module.css";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "pedeaqui-theme";
const cycleOrder: ThemePreference[] = ["system", "light", "dark"];

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

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const current = document.documentElement.dataset.themePreference;
    setPreference(isThemePreference(current) ? current : "system");
  }, []);

  function cycleTheme() {
    const currentIndex = cycleOrder.indexOf(preference);
    const next = cycleOrder[(currentIndex + 1) % cycleOrder.length];
    applyTheme(next);
    setPreference(next);
  }

  const next = cycleOrder[(cycleOrder.indexOf(preference) + 1) % cycleOrder.length];
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
