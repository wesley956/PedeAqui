"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./product-sheet.module.css";

/**
 * Gaveta do produto (protótipo Expresso): abre por cima do cardápio, sem trocar de página.
 * Fecha no X, tocando fora ou com Esc, e volta exatamente para onde o cliente estava na lista.
 */
export function ProductSheet({ label, children }: { label: string; children: ReactNode }) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") router.back(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [router]);

  return (
    <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <div ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={() => router.back()} aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}
