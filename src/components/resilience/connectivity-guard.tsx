"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function isOnline() {
  return navigator.onLine;
}

export function ConnectivityGuard() {
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);

  useEffect(() => {
    let dirty = false;
    const markDirty = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (!target.closest("form") || target.type === "hidden" || target.type === "password" || target.type === "file") return;
      dirty = true;
    };
    const clearDirty = (event: Event) => {
      if (event.target instanceof HTMLFormElement) dirty = false;
    };
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("input", markDirty, { passive: true });
    document.addEventListener("change", markDirty, { passive: true });
    document.addEventListener("submit", clearDirty);
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      document.removeEventListener("input", markDirty);
      document.removeEventListener("change", markDirty);
      document.removeEventListener("submit", clearDirty);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, []);

  return online ? null : (
    <div role="alert" aria-live="assertive" style={{ position: "fixed", inset: "0 0 auto", zIndex: 9999, padding: "10px 16px", textAlign: "center", background: "#7a271a", color: "#fff", fontWeight: 800 }}>
      Sem internet. Não feche esta página: confira os dados e envie quando a conexão voltar.
    </div>
  );
}
