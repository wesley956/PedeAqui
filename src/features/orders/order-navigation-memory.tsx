"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export function OrderListPosition({ storageKey }: { storageKey: string }) {
  useLayoutEffect(() => {
    const saved = Number(window.sessionStorage.getItem(`${storageKey}:scroll`) ?? 0);
    if (Number.isFinite(saved) && saved > 0) window.requestAnimationFrame(() => window.scrollTo({ top: saved }));
  }, [storageKey]);

  useEffect(() => {
    const save = () => window.sessionStorage.setItem(`${storageKey}:scroll`, String(window.scrollY));
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [storageKey]);

  return null;
}

export function useRememberedOrderSearch(key: string, value: string, setValue: (value: string) => void) {
  const restored = useRef(false);
  useEffect(() => {
    const saved = window.sessionStorage.getItem(key);
    if (saved) setValue(saved);
    queueMicrotask(() => { restored.current = true; });
  }, [key, setValue]);

  useEffect(() => {
    if (!restored.current) return;
    window.sessionStorage.setItem(key, value);
  }, [key, value]);
}
