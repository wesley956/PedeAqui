import Link from "next/link";
import { businessVocabulary } from "@/modules/business-vocabulary";
import type { ModuleKey } from "@/modules/module-catalog";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import styles from "./settings-hub.module.css";
import { ThemeSelector } from "@/components/theme/theme-selector";

type SettingsGroup = "Estabelecimento" | "Operação" | "Canais e integrações";
type StoreSetting = { group: SettingsGroup; title: string; description: string; href: string; permissions: readonly string[]; moduleKey?: ModuleKey };
const storeSettings: readonly StoreSetting[] = [
  { group: "Estabelecimento", title: "Dados da loja", description: "Nome, telefone, e-mail, endereço, cidade e estado da unidade.", href: "/configuracoes/loja", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Estabelecimento", title: "Cardápio e identidade", description: "Logo, capa, cor, publicação e pedido mínimo do cardápio público.", href: "/configuracoes/cardapio", permissions: [PERMISSIONS.STORES_VIEW], moduleKey: "catalog" },
  { group: "Estabelecimento", title: "Horários", description: "Períodos de funcionamento, inclusive após meia-noite.", href: "/configuracoes/horarios", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Operação", title: "Fluxo de pedidos", description: "Escolha um fluxo completo, simplificado ou personalize as etapas de entrega e retirada.", href: "/configuracoes/fluxo-pedidos", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Operação", title: "Salão e mesas", description: "Estrutura de mesas, capacidade, áreas e QR do salão.", href: "/configuracoes/salao", permissions: [PERMISSIONS.DINING_MANAGE], moduleKey: "dining" },
  { group: "Operação", title: "Caixas", description: "Pontos físicos usados na abertura e fechamento dos turnos.", href: "/configuracoes/caixa", permissions: [PERMISSIONS.CASH_MANAGE], moduleKey: "cash" },
  { group: "Operação", title: "Entrega", description: "Prazo, taxa padrão, frete grátis e áreas atendidas.", href: "/configuracoes/entrega", permissions: [PERMISSIONS.STORES_VIEW], moduleKey: "deliveries" },
  { group: "Operação", title: "Entregadores", description: "Equipe, disponibilidade, acesso e capacidade simultânea.", href: "/configuracoes/entregadores", permissions: [PERMISSIONS.DELIVERY_MANAGE], moduleKey: "driver" },
  { group: "Operação", title: "Pagamentos", description: "Pix, cartões e dinheiro disponíveis para seus clientes.", href: "/configuracoes/pagamentos", permissions: [PERMISSIONS.STORES_VIEW] },
  { group: "Canais e integrações", title: "Conversas e WhatsApp", description: "Conexão do WhatsApp, atendimento automático e mensagem de boas-vindas.", href: "/configuracoes/conversas", permissions: [PERMISSIONS.INTEGRATIONS_VIEW, PERMISSIONS.CONVERSATIONS_VIEW], moduleKey: "conversations" },
  { group: "Canais e integrações", title: "Impressões", description: "Impressoras, locais de impressão e acompanhamento da fila.", href: "/configuracoes/impressoes", permissions: [PERMISSIONS.PRINTING_VIEW] },
];
const administrationDescriptions: Record<string, string> = { catalog: "Produtos, categorias e estrutura do catálogo.", inventory: "Estoque e fichas técnicas quando aplicáveis.", suppliers: "Cadastro e manutenção dos fornecedores.", purchases: "Compras e entrada de suprimentos.", team: "Usuários, funções e permissões da equipe.", scale: "Escalas e organização da equipe." };
const groupDescriptions: Record<SettingsGroup, string> = { Estabelecimento: "Identidade e funcionamento da unidade.", Operação: "Preferências da operação ativa.", "Canais e integrações": "Conexões e equipamentos que apoiam o atendimento." };

export default async function SettingsPage() {
  const access = await NavigationAccessService.load();
  const vocabulary = businessVocabulary(access.businessType);
  const granted = new Set(access.permissionKeys);
  const settings = storeSettings.filter((item) => item.permissions.some((permission) => granted.has(permission)) && (!item.moduleKey || access.moduleAvailability[item.moduleKey].available));
  const administration = access.items.filter((item) => item.key in administrationDescriptions);
  const groups = (Object.keys(groupDescriptions) as SettingsGroup[]).map((group) => ({ group, items: settings.filter((item) => item.group === group) })).filter(({ items }) => items.length > 0);
  const canManageModules = granted.has(PERMISSIONS.STORES_MANAGE);

  return <section className={styles.root}>
    <header className={styles.header}><h1>Configurações</h1><p className="muted">Ajuste as preferências da {vocabulary.unitLabel} de forma simples e centralizada.</p></header>
    {canManageModules ? <section className={styles.section} aria-labelledby="settings-modules-title"><div className={styles.sectionHeader}><h2 id="settings-modules-title">Ferramentas da unidade</h2><p className="muted">Ative somente os módulos que fazem sentido. Desativar não apaga dados.</p></div><div className={styles.grid}><Link href="/configuracoes/modulos" className={styles.linkCard}><strong>Módulos</strong><span>Escolha entre uma configuração essencial, completa ou personalizada.</span><em>Gerenciar módulos →</em></Link></div></section> : null}
    <section className={styles.section} aria-labelledby="settings-appearance-title"><div className={styles.sectionHeader}><h2 id="settings-appearance-title">Aparência</h2><p className="muted">Escolha como o PedeAqui aparece neste dispositivo.</p></div><ThemeSelector /></section>
    {groups.map(({ group, items }) => <section key={group} className={styles.section} aria-labelledby={`settings-${group}`}><div className={styles.sectionHeader}><h2 id={`settings-${group}`}>{group}</h2><p className="muted">{groupDescriptions[group]}</p></div><div className={styles.grid}>{items.map((item) => <Link key={item.href} href={item.href} className={styles.linkCard}><strong>{item.title}</strong><span>{item.description}</span><em>Abrir configuração →</em></Link>)}</div></section>)}
    {administration.length > 0 ? <section className={styles.section} aria-labelledby="settings-admin-title"><div className={styles.sectionHeader}><h2 id="settings-admin-title">Equipe, cadastros e estrutura</h2><p className="muted">Acesse os módulos administrativos disponíveis para a sua função.</p></div><div className={styles.grid}>{administration.map((item) => <Link key={item.key} href={item.href} className={styles.linkCard}><strong>{item.label}</strong><span>{administrationDescriptions[item.key]}</span><em>Abrir módulo →</em></Link>)}</div></section> : null}
  </section>;
}
