import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

export const navigation = [
  ["Dashboard", "/dashboard"],
  ["Pedidos", "/pedidos"],
  ["Cardápio", "/cardapio/produtos"],
  ["PDV", "/pdv"],
  ["Produção", "/producao"],
  ["Clientes", "/clientes"],
  ["Equipe", "/equipe"],
  ["Configurações", "/configuracoes"],
] as const;

export function AppShell({ children, email }: { children: ReactNode; email: string | null }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-row" aria-label="PedeAqui">
          <div className="brand-mark" aria-hidden>P</div>
          <strong className="brand-wordmark"><span>Pede</span><span>Aqui</span></strong>
        </div>
        <nav className="app-nav" aria-label="Navegação principal">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href} className="app-nav-link">{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <strong>Operação</strong>
            <div className="muted" style={{ fontSize: 12 }}>Unidade atual protegida pelo contexto multiempresa</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {email ? <span className="muted app-user-email">{email}</span> : null}
            <form action={signOutAction}><Button tone="secondary" type="submit">Sair</Button></form>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Navegação mobile">
        {navigation.map(([label, href]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
