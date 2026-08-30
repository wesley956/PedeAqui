import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { signOutAction } from "@/features/auth/actions";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import styles from "./platform-shell-v3.module.css";

type PlatformRole = "super_admin" | "support";

function navigationFor(role: PlatformRole) {
  const ownerOnly = role === "super_admin";
  return [
    {
      label: "Início",
      items: [
        ["Visão geral", "/platform"],
        ["Pendências", "/platform/pendencias"],
        ["Apresentação", "/platform/apresentacao"],
      ],
    },
    {
      label: "Clientes",
      items: [
        ["Empresas e unidades", "/platform#empresas"],
        ...(ownerOnly ? [
          ["Novo cliente", "/platform/novo-restaurante"],
          ["Onboarding", "/platform/onboarding"],
          ["Comunicação", "/platform/comunicacao"],
        ] : []),
      ],
    },
    ...(ownerOnly ? [{
      label: "Comercial",
      items: [
        ["CRM e propostas", "/platform/comercial"],
        ["Assinaturas", "/platform/assinaturas"],
        ["Financeiro PedeAqui", "/platform/financeiro"],
        ["Clube Fundadores", "/platform/fundadores"],
        ["Produto e módulos", "/platform/produto"],
      ],
    }] : []),
    {
      label: "Operação",
      items: [
        ["Operação", "/platform/operacao"],
        ["Integrações", "/platform/integracoes"],
        ["Incidentes", "/platform/incidentes"],
        ["Alertas", "/platform/alertas"],
      ],
    },
    {
      label: "Suporte e plataforma",
      items: [
        ["Suporte", "/platform/suporte"],
        ["Modo suporte", "/platform/suporte/modo"],
        ["Integridade", "/platform/integridade"],
        ["Auditoria", "/platform/auditoria"],
        ...(ownerOnly ? [
          ["Equipe interna", "/platform/equipe"],
          ["Privacidade / LGPD", "/platform/privacidade"],
          ["Configurações", "/platform/configuracoes"],
        ] : []),
      ],
    },
  ] as Array<{ label: string; items: string[][] }>;
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let access: Awaited<ReturnType<typeof PlatformAdminService.access>>;
  try {
    access = await PlatformAdminService.access();
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) notFound();
    throw error;
  }

  const roleLabel = access.role === "super_admin" ? "Proprietário" : "Suporte";
  const navigation = navigationFor(access.role);

  return (
    <div className={styles.shell}>
      <a href="#platform-content" className={styles.skip}>Pular para o conteúdo</a>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <PedeAquiLogo size="sm" decorative />
          <div className={styles.brandCopy}>
            <strong>PedeAqui</strong>
            <span>Painel do Proprietário</span>
          </div>
        </div>

        <nav className={styles.navigation} aria-label="Painel do Proprietário">
          {navigation.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <span className={styles.navGroupTitle}>{group.label}</span>
              <div className={styles.navGroupLinks}>
                {group.items.map(([label, href]) => (
                  <Link className={styles.navLink} key={href} href={href}>
                    <span className={styles.navDot} aria-hidden />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <Link href="/dashboard" className={styles.backLink}>← Voltar ao restaurante</Link>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.identity}>
            <strong>{roleLabel}</strong>
            <span>{access.user.email ?? "Acesso de plataforma"}</span>
          </div>
          <div className={styles.topActions}>
            <ThemeSelector compact />
            <form action={signOutAction}>
              <button type="submit" className={styles.exit}>Sair</button>
            </form>
          </div>
        </header>
        <main id="platform-content" className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
