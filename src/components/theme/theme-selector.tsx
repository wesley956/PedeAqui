"use client";

import { useEffect, useState } from "react";
import styles from "./theme-selector.module.css";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "pedeaqui-theme";
const darkModeQuery = "(prefers-color-scheme: dark)";

function isThemePreference(value: string | null | undefined): value is ThemePreference {
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

function SunIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6"/><path d="M12 2v2.1M12 19.9V22M4.93 4.93l1.49 1.49M17.58 17.58l1.49 1.49M2 12h2.1M19.9 12H22M4.93 19.07l1.49-1.49M17.58 6.42l1.49-1.49"/></svg>;
}

function MoonIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.4A8.7 8.7 0 0 1 8.6 3.6 8.8 8.8 0 1 0 20.4 15.4Z"/></svg>;
}

function AutomaticIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.7 4.2A7.8 7.8 0 0 0 5 16.1a7.8 7.8 0 0 0 11.2 1.8"/>
      <path d="M14.1 4.4a5.6 5.6 0 0 0 5.5 7.1 6.2 6.2 0 0 1-5.9 5.1 6.2 6.2 0 0 1-1.8-.3"/>
      <circle cx="8.2" cy="9.1" r="2.1"/>
      <path d="M8.2 4.9V3.6M8.2 14.6v-1.3M4 9.1H2.7M13.7 9.1h-1.3M5.2 6.1l-.9-.9M12.1 13l-.9-.9"/>
    </svg>
  );
}

const options: Array<{ value: ThemePreference; label: string; icon: () => React.ReactNode }> = [
  { value: "light", label: "Claro", icon: SunIcon },
  { value: "system", label: "Automático", icon: AutomaticIcon },
  { value: "dark", label: "Escuro", icon: MoonIcon },
];

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
    const fromDocument = document.documentElement.dataset.themePreference;
    const initial = isThemePreference(stored) ? stored : isThemePreference(fromDocument) ? fromDocument : "system";
    setPreference(initial);
    applyTheme(initial);

    const media = window.matchMedia(darkModeQuery);
    const handleSystemChange = () => {
      if (document.documentElement.dataset.themePreference === "system") applyTheme("system");
    };
    media.addEventListener("change", handleSystemChange);
    return () => media.removeEventListener("change", handleSystemChange);
  }, []);

  function chooseTheme(value: ThemePreference) {
    setPreference(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // The choice still applies for the current page when storage is unavailable.
    }
    applyTheme(value);
  }

  return (
    <div className={`${styles.root} ${compact ? styles.compact : styles.card}`}>
      {!compact ? <span className={styles.label}>Tema</span> : null}
      <div className={styles.segmented} role="group" aria-label="Tema da interface">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={styles.option}
              data-selected={selected ? "true" : "false"}
              aria-pressed={selected}
              aria-label={option.label}
              title={option.label}
              onClick={() => chooseTheme(option.value)}
            >
              <span className={styles.icon}><Icon /></span>
              {!compact ? <span>{option.label}</span> : null}
            </button>
          );
        })}
      </div>
      {!compact ? <p className={styles.help}>Automático acompanha a aparência escolhida no seu aparelho.</p> : null}
    </div>
  );
}
