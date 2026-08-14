"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PublicOrderRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refreshIfVisible, intervalMs);
    const onVisibility = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, router]);
  return null;
}
