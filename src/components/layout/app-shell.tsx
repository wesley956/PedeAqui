import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { signOutAction } from "@/features/auth/actions";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { Button } from "@/components/ui/button";
import { DesktopNavigation, type ShellNavigationItem } from "@/components/layout/desktop-navigation";
import type { ResolvedBranding } from "@/server/platform/branding-read-service";

export function AppShell({ children, email, branding, navigationItems }: { children: ReactNode; email: string | null; branding: ResolvedBranding; navigationItems: readonly ShellNavigationItem[] }) {
  // White-label values are runtime data. Keeping this single style object inline is intentional:
  // it only feeds the documented accent aliases and never introduces arbitrary layout values.
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
                <img src={branding.logoUrl} alt="" width={32} height={32} className="brand-logo-image" />
              ) : (
                <div className="brand-mark" aria-hidden>{branding.productName.slice(0, 1).toUpperCase()}</div>
              )}
              <strong className="brand-wordmark"><span>{branding.productName}</span></strong>
            </>
          )}
        </div>
        <DesktopNavigation items={navigationItems} />
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-context">
            <strong>Operação</strong>
            <span className="app-topbar-meta">Unidade atual protegida pelo contexto multiempresa</span>
          </div>
          <div className="app-topbar-actions">
            {email ? <span className="muted app-user-email">{email}</span> : null}
            <form action={signOutAction}><Button tone="secondary" type="submit">Sair</Button></form>
          </div>
        </header>
        <main className="app-content">{children}</main>
        {!branding.hidePedeAquiBranding && !usesPlatformDefault ? (
          <footer className="platform-footer" aria-label="Tecnologia PedeAqui">
            <span>Tecnologia</span>
            <PedeAquiLogo size="xs" decorative />
          </footer>
        ) : null}
      </div>
      <nav className="mobile-nav" aria-label="Navegação mobile">{navigationItems.map((item) => <Link key={item.key} href={item.href}>{item.label}</Link>)}</nav>
    </div>
  );
}
