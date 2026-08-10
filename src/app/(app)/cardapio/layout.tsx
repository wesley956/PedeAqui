import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  ["Produtos", "/cardapio/produtos"],
  ["Categorias", "/cardapio/categorias"],
  ["Adicionais", "/cardapio/adicionais"],
] as const;

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <nav className="card" aria-label="Navegação do cardápio" style={{ padding: 10, display: "flex", gap: 8, overflowX: "auto" }}>
        {links.map(([label, href]) => (
          <Link key={href} href={href} style={{ padding: "9px 12px", borderRadius: 9, background: "var(--surface-2)", whiteSpace: "nowrap", fontWeight: 700 }}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
