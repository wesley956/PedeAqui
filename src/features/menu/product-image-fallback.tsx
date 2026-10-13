import styles from "./menu-browser.module.css";

/** Produto sem foto: um prato desenhado na cor da loja, no lugar de um texto "Sem foto". */
export function ProductImageFallback({ className }: { className?: string }) {
  return <div aria-hidden className={`${styles.imageFallback} ${className ?? ""}`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
      <circle cx="12" cy="13" r="6.5" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M3 4v5.5a1.5 1.5 0 0 0 3 0V4M4.5 4v16" />
      <path d="M20.5 4c-1.4.6-2.5 2.4-2.5 4.6V12h2.5v8" />
    </svg>
  </div>;
}
