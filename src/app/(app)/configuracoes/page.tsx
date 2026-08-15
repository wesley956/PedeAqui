import Link from "next/link";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import styles from "./settings-hub.module.css";
import { ThemeSelector } from "@/components/theme/theme-selector";

type SettingsGroup = "Estabelecimento" | "Operação" | "Canais e integrações";
const storeSettings = [
  { group: "Estabelecimento" as SettingsGroup, title: "Loja e identidade", description: "Nome público, identidade do restaurante, publicação e pedido mínimo.", href: "/configuracoes/cardapio", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Estabelecimento" as SettingsGroup, title: "Horários", description: "Períodos de funcionamento, inclusive após meia-noite.", href: "/configuracoes/horarios", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Operação" as SettingsGroup, title: "Salão e mesas", description: "Estrutura de mesas, capacidade, áreas e QR do salão.", href: "/configuracoes/salao", permissions: [PERMISSIONS.DINING_MANAGE] },
  { group: "Operação" as SettingsGroup, title: "Caixas", description: "Pontos físicos usados na abertura e fechamento dos turnos.", href: "/configuracoes/caixa", permissions: [PERMISSIONS.CASH_MANAGE] },
  { group: "Operação" as SettingsGroup, title: "Entrega", description: "Prazo, taxa padrão, frete grátis e bairros atendidos.", href: "/configuracoes/entrega", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Operação" as SettingsGroup, title: "Entregadores", description: "Equipe, disponibilidade, acesso e capacidade simultânea.", href: "/configuracoes/entregadores", permissions: [PERMISSIONS.DELIVERY_MANAGE] },
  { group: "Operação" as SettingsGroup, title: "Pagamentos", description: "Pix, cartões e dinheiro disponíveis no checkout.", href: "/configuracoes/pagamentos", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Canais e integrações" as SettingsGroup, title: "Conversas e WhatsApp", description: "Provider, webhook, bot e referências seguras de credenciais.", href: "/configuracoes/conversas", permissions: [PERMISSIONS.INTEGRATIONS_VIEW, PERMISSIONS.CONVERSATIONS_VIEW] },
  { group: "Canais e integrações" as SettingsGroup, title: "Impressões", description: "Estações, impressoras, Print Agents, roteamento e fila persistente.", href: "/configuracoes/impressoes", permissions: [PERMISSIONS.PRINTING_VIEW] },
] as const;
const administrationDescriptions: Record<string, string> = { catalog: "Produtos, categorias e estrutura do catálogo.", inventory: "Ingredientes, estoque e fichas técnicas.", suppliers: "Cadastro e manutenção dos fornecedores.", purchases: "Compras e entrada de suprimentos.", team: "Usuários, funções e permissões da equipe.", scale: "Escalas e organização da equipe." };
const groupDescriptions: Record<SettingsGroup, string> = { Estabelecimento: "Identidade e funcionamento da unidade.", Operação: "Parâmetros que afetam atendimento, caixa, salão, entrega e pagamento.", "Canais e integrações": "Conexões externas e equipamentos que apoiam a operação." };

export default async function SettingsPage() {
  const access = await NavigationAccessService.load();
  const granted = new Set(access.permissionKeys);
  const settings = storeSettings.filter((item) => item.permissions.some((permission) => granted.has(permission)));
  const administration = access.items.filter((item) => item.key in administrationDescriptions);
  const groups = (Object.keys(groupDescriptions) as SettingsGroup[]).map((group) => ({ group, items: settings.filter((item) => item.group === group) })).filter(({ items }) => items.length > 0);
  return <section className={styles.root}>
    <header className={styles.header}><h1>Configurações</h1><p className="muted">Um único ponto de entrada para parâmetros da unidade. Cada cartão continua apontando para a rota e a fonte de verdade já existentes.</p></header>
    <section className={styles.section} aria-labelledby="settings-appearance-title"><div className={styles.sectionHeader}><h2 id="settings-appearance-title">Aparência</h2><p className="muted">Escolha como o PedeAqui aparece neste dispositivo.</p></div><ThemeSelector /></section>
    {groups.map(({ group, items }) => <section key={group} className={styles.section} aria-labelledby={`settings-${group}`}><div className={styles.sectionHeader}><h2 id={`settings-${group}`}>{group}</h2><p className="muted">{groupDescriptions[group]}</p></div><div className={styles.grid}>{items.map((item) => <Link key={item.href} href={item.href} className={styles.linkCard}><strong>{item.title}</strong><span>{item.description}</span><em>Abrir configuração →</em></Link>)}</div></section>)}
    {administration.length > 0 ? <section className={styles.section} aria-labelledby="settings-admin-title"><div className={styles.sectionHeader}><h2 id="settings-admin-title">Equipe, cadastros e estrutura</h2><p className="muted">Módulos administrativos autorizados para sua função; nenhuma rota ou permissão é duplicada pelo hub.</p></div><div className={styles.grid}>{administration.map((item) => <Link key={item.key} href={item.href} className={styles.linkCard}><strong>{item.label}</strong><span>{administrationDescriptions[item.key]}</span><em>Abrir módulo →</em></Link>)}</div></section> : null}
  </section>;
}
