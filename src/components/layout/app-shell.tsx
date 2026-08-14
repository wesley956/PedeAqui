import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { signOutAction } from "@/features/auth/actions";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { Button } from "@/components/ui/button";
import type { ResolvedBranding } from "@/server/platform/branding-read-service";

export const navigation = [
  ["Dashboard", "/dashboard"],
  ["Pedidos", "/pedidos"],
  ["Conversas", "/conversas"],
  ["Salão", "/salao"],
  ["Cardápio", "/cardapio/produtos"],
  ["PDV", "/pdv"],
  ["Caixa", "/caixa"],
  ["Financeiro", "/financeiro"],
  ["Fiscal", "/fiscal"],
  ["Produção", "/producao"],
  ["Entregas", "/entregas"],
  ["Meu roteiro", "/entregador"],
  ["Estoque", "/estoque"],
  ["Fornecedores", "/fornecedores"],
  ["Compras", "/compras"],
  ["Clientes", "/clientes"],
  ["Crescimento", "/crescimento"],
  ["Escala", "/escala"],
  ["Equipe", "/equipe"],
  ["Configurações", "/configuracoes"],
] as const;

export function AppShell({ children, email, branding }: { children: ReactNode; email: string | null; branding: ResolvedBranding }) {
  const style = {
    ...(branding.primaryColor ? { "--accent": branding.primaryColor } : {}),
    ...(branding.secondaryColor ? { "--accent-strong": branding.secondaryColor } : {}),
  } as CSSProperties;
  const usesPlatformDefault = branding.productName === "PedeAqui" && !branding.logoUrl;

  return (
    <div className="app-shell" style={style}>
      <aside className="app-sidebar">
        <div className="brand-row" aria-label={branding.productName}>
          {usesPlatformDefault ? (
            <PedeAquiLogo size="sm" decorative />
          ) : (
            <>
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="" width={34} height={34} style={{ objectFit: "contain", borderRadius: 8 }} />
              ) : (
                <div className="brand-mark" aria-hidden>{branding.productName.slice(0, 1).toUpperCase()}</div>
              )}
              <strong className="brand-wordmark"><span>{branding.productName}</span></strong>
            </>
          )}
        </div>
        <nav className="app-nav" aria-label="Navegação principal">
          {navigation.map(([label, href]) => <Link key={href} href={href} className="app-nav-link">{label}</Link>)}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div><strong>Operação</strong><div className="muted" style={{ fontSize: 12 }}>Unidade atual protegida pelo contexto multiempresa</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{email ? <span className="muted app-user-email">{email}</span> : null}<form action={signOutAction}><Button tone="secondary" type="submit">Sair</Button></form></div>
        </header>
        <main className="app-content">{children}</main>
        {!branding.hidePedeAquiBranding && !usesPlatformDefault ? (
          <footer className="muted" aria-label="Tecnologia PedeAqui" style={{ padding: "0 24px 24px", fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}>
            <span>Tecnologia</span>
            <PedeAquiLogo size="xs" decorative />
          </footer>
        ) : null}
      </div>
      <nav className="mobile-nav" aria-label="Navegação mobile">{navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
    </div>
  );
}
