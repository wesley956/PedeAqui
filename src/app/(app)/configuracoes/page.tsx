import Link from "next/link";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import styles from "./settings-hub.module.css";

const storeSettings = [
  { title: "Cardápio digital", description: "Identidade, publicação, entrega/retirada e pedido mínimo.", href: "/configuracoes/cardapio", permissions: [PERMISSIONS.STORES_VIEW] },
  { title: "Salão e mesas", description: "Estrutura de mesas, capacidade, áreas e QR do salão.", href: "/configuracoes/salao", permissions: [PERMISSIONS.DINING_MANAGE] },
  { title: "Horários", description: "Períodos de funcionamento, inclusive após meia-noite.", href: "/configuracoes/horarios", permissions: [PERMISSIONS.STORES_VIEW] },
  { title: "Entrega", description: "Prazo, taxa padrão, frete grátis e bairros atendidos.", href: "/configuracoes/entrega", permissions: [PERMISSIONS.STORES_VIEW] },
  { title: "Pagamentos", description: "Pix, cartões e dinheiro disponíveis no checkout.", href: "/configuracoes/pagamentos", permissions: [PERMISSIONS.STORES_VIEW] },
  { title: "Conversas e WhatsApp", description: "Provider, webhook, bot e referências seguras de credenciais.", href: "/configuracoes/conversas", permissions: [PERMISSIONS.INTEGRATIONS_VIEW, PERMISSIONS.CONVERSATIONS_VIEW] },
  { title: "Impressões", description: "Estações, impressoras, Print Agents, roteamento e fila persistente.", href: "/configuracoes/impressoes", permissions: [PERMISSIONS.PRINTING_VIEW] },
] as const;

const administrationDescriptions: Record<string, string> = {
  catalog: "Produtos, categorias e estrutura do catálogo.",
  inventory: "Ingredientes, estoque e fichas técnicas.",
  suppliers: "Cadastro e manutenção dos fornecedores.",
  purchases: "Compras e entrada de suprimentos.",
  team: "Usuários, funções e equipe — inclusive perfis de entrega.",
  scale: "Escalas e organização da equipe.",
};

export default async function SettingsPage() {
  const access = await NavigationAccessService.load();
  const granted = new Set(access.permissionKeys);
  const settings = storeSettings.filter((item) => item.permissions.some((permission) => granted.has(permission)));
  const administration = access.items.filter((item) => item.key in administrationDescriptions);

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <h1>Configurações</h1>
        <p className="muted">Cadastros, canais, equipamentos e parâmetros da unidade. A operação do turno continua nas telas de Pedidos, PDV, Salão, Produção e Entregas.</p>
      </header>

      {settings.length > 0 ? (
        <section className={styles.section} aria-labelledby="settings-store-title">
          <div className={styles.sectionHeader}>
            <h2 id="settings-store-title">Loja, canais e equipamentos</h2>
            <p className="muted">Ajustes que normalmente são feitos fora do fluxo rápido de atendimento.</p>
          </div>
          <div className={styles.grid}>
            {settings.map((item) => (
              <Link key={item.href} href={item.href} className={styles.linkCard}>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                <em>Abrir configuração →</em>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {administration.length > 0 ? (
        <section className={styles.section} aria-labelledby="settings-admin-title">
          <div className={styles.sectionHeader}>
            <h2 id="settings-admin-title">Cadastros e estrutura</h2>
            <p className="muted">Atalhos para módulos administrativos que sua função já pode acessar. As URLs e permissões originais continuam valendo.</p>
          </div>
          <div className={styles.grid}>
            {administration.map((item) => (
              <Link key={item.key} href={item.href} className={styles.linkCard}>
                <strong>{item.label}</strong>
                <span>{administrationDescriptions[item.key]}</span>
                <em>Abrir módulo →</em>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
