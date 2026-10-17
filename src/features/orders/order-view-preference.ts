"use client";

import { useCallback, useSyncExternalStore } from "react";

export type OrderView = "queue" | "list" | "board";
const changeEvent = "pedeaqui:orders-view-changed";
// Used only by browser event handlers when persistent storage is unavailable.
const fallback = new Map<string, OrderView>();
const serverSnapshot = (): OrderView => "queue";

function validView(value: string | null): value is OrderView {
  return value === "queue" || value === "list" || value === "board";
}

export function readOrderView(key: string): OrderView {
  if (typeof window === "undefined") return "queue";
  const temporary = fallback.get(key);
  if (temporary) return temporary;
  try {
    const value = window.localStorage.getItem(key);
    return validView(value) ? value : "queue";
  } catch {
    return "queue";
  }
}

export function rememberOrderView(key: string, view: OrderView) {
  fallback.set(key, view);
  try {
    window.localStorage.setItem(key, view);
    fallback.delete(key);
  } catch {
    // Changing the view must remain usable even when the browser blocks storage.
  }
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: key }));
}

export function subscribeOrderView(key: string, notify: () => void) {
  const changed = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key) notify();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      fallback.delete(key);
      notify();
    }
  };
  window.addEventListener(changeEvent, changed);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(changeEvent, changed);
    window.removeEventListener("storage", storageChanged);
  };
}

export function useOrderViewPreference(key: string) {
  const subscribe = useCallback((notify: () => void) => subscribeOrderView(key, notify), [key]);
  const snapshot = useCallback(() => readOrderView(key), [key]);
  const setView = useCallback((view: OrderView) => rememberOrderView(key, view), [key]);
  const view = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return [view, setView] as const;
}
