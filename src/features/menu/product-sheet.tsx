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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      dialog?.close();
      previousFocus?.focus({ preventScroll: true });
    };
  }, [router]);

  return (
    <dialog ref={dialogRef} className={styles.overlay} aria-label={label} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) { event.preventDefault(); sheetRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }} onCancel={(event) => { event.preventDefault(); router.back(); }} onClick={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <div ref={sheetRef} className={styles.sheet} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={() => router.back()} aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        {children}
      </div>
    </dialog>
  );
}
