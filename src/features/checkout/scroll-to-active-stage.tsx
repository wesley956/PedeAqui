"use client";

import { useEffect } from "react";

/** Depois de salvar uma etapa, leva o cliente direto à próxima etapa aberta na mesma tela. */
export function ScrollToActiveStage({ targetId }: { targetId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [targetId]);
  return null;
}
