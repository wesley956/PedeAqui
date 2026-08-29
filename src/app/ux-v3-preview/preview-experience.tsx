"use client";

import { useMemo, useState } from "react";
import styles from "./preview.module.css";

type Screen = "inicio" | "ferramentas" | "configuracoes" | "recursos" | "entregador-login" | "entregador-rota";

type Resource = { name: string; description: string; active: boolean; locked?: boolean };

const INITIAL_RESOURCES: Resource[] = [
  { name: "Pedidos", description: "Receber e acompanhar pedidos", active: true, locked: true },
  { name: "Cardápio", description: "Produtos, categorias e adicionais", active: true, locked: true },
  { name: "Delivery", description: "Produção e entregas", active: true },
  { name: "WhatsApp", description: "Conversas e notificações", active: false },
  { name: "PDV / Caixa", description: "Venda presencial e controle do turno", active: true },
  { name: "Salão e mesas", description: "Mesas, comandas e QR", active: false },
  { name: "Estoque", description: "Saldos e movimentações", active: false },
  { name: "Financeiro", description: "Receitas, despesas e indicadores", active: false },
  { name: "Compras e fornecedores", description: "Reposição e recebimento", active: false },
  { name: "Fiscal", description: "Documentos e integrações fiscais", active: false },
  { name: "Clientes e crescimento", description: "Histórico, fidelidade e campanhas", active: true },
  { name: "Equipe e escalas", description: "Usuários, funções e organização", active: false },
];

const SETTINGS = [
  ["🏪", "Minha loja", "Nome, telefone, logo, endereço, aparência e horários."],
  ["🧾", "Pedidos e atendimento", "Fluxo do pedido, retirada, produção e tempo estimado."],
  ["💳", "Pagamentos", "Dinheiro, cartões, Pix e pagamento online."],
  ["🚚", "Entrega e retirada", "Bairros, taxas, prazo, frete grátis e entregadores."],
  ["💬", "WhatsApp", "Número conectado, atendimento e notificações."],
  ["🖨️", "Impressão automática", "Impressoras, setores e acompanhamento da fila."],
  ["👥", "Equipe e acessos", "Funcionários, permissões e entregadores."],
] as const;

const TOOLS = [
  ["Operação", [["🍳", "Produção", "Fila da cozinha"], ["🚚", "Entregas", "Pedidos em rota"], ["🪑", "Salão e mesas", "Mesas e comandas"]]],
  ["Clientes e vendas", [["👤", "Clientes", "Histórico e dados"], ["💬", "Conversas", "Atendimento"], ["📣", "Crescimento", "Campanhas e fidelidade"]]],
  ["Estoque e compras", [["📦", "Estoque", "Saldos e movimentos"], ["🧾", "Compras", "Reposição e entrada"], ["🏭", "Fornecedores", "Cadastro e contatos"]]],
  ["Gestão", [["💰", "Financeiro", "Receitas e despesas"], ["🧮", "Fiscal", "Documentos fiscais"], ["📊", "Relatórios", "Visão do negócio"]]],
  ["Equipe", [["👥", "Equipe", "Funcionários e funções"], ["🗓️", "Escalas", "Organização da equipe"], ["🛵", "Entregadores", "Acesso e disponibilidade"]]],
] as const;

export function PreviewExperience() {
  const [screen, setScreen] = useState<Screen>("inicio");
  const [resources, setResources] = useState(INITIAL_RESOURCES);
  const [search, setSearch] = useState("");
  const [settingSearch, setSettingSearch] = useState("");

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return TOOLS;
    return TOOLS.map(([group, tools]) => [group, tools.filter(([, name, description]) => `${name} ${description}`.toLowerCase().includes(query))] as const)
      .filter(([, tools]) => tools.length > 0);
  }, [search]);

  const filteredSettings = useMemo(() => {
    const query = settingSearch.trim().toLowerCase();
    if (!query) return SETTINGS;
    const aliases: Record<string, string> = {
      bairro: "Entrega e retirada", taxa: "Entrega e retirada", frete: "Entrega e retirada", entregador: "Entrega e retirada",
      pix: "Pagamentos", cartao: "Pagamentos", dinheiro: "Pagamentos",
      horario: "Minha loja", logo: "Minha loja", endereco: "Minha loja",
      impressora: "Impressão automática", imprimir: "Impressão automática",
      whatsapp: "WhatsApp", mensagem: "WhatsApp",
      equipe: "Equipe e acessos", funcionario: "Equipe e acessos", permissao: "Equipe e acessos",
    };
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const alias = Object.entries(aliases).find(([key]) => normalized.includes(key))?.[1];
    return SETTINGS.filter(([, title, description]) => {
      const haystack = `${title} ${description}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return haystack.includes(normalized) || title === alias;
    });
  }, [settingSearch]);

  function go(next: Screen) {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleResource(index: number) {
    setResources((current) => current.map((item, itemIndex) => itemIndex === index && !item.locked ? { ...item, active: !item.active } : item));
  }

  return (
    <div className={styles.previewRoot}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><span>Pede</span>Aqui</div>
        <div className={styles.previewBadge}>PREVIEW UX V3 · SEM DADOS REAIS</div>
        <p className={styles.groupLabel}>Principal</p>
        <NavButton icon="🏠" label="Início" active={screen === "inicio"} onClick={() => go("inicio")} />
        <NavButton icon="🧾" label="Pedidos" />
        <NavButton icon="🍔" label="Cardápio" />
        <NavButton icon="💵" label="PDV / Caixa" />
        <p className={styles.groupLabel}>Organização</p>
        <NavButton icon="⋯" label="Mais ferramentas" active={screen === "ferramentas"} onClick={() => go("ferramentas")} />
        <NavButton icon="⚙️" label="Configurações" active={screen === "configuracoes" || screen === "recursos"} onClick={() => go("configuracoes")} />
        <p className={styles.groupLabel}>Experiências especiais</p>
        <NavButton icon="🛵" label="Acesso do entregador" active={screen === "entregador-login" || screen === "entregador-rota"} onClick={() => go("entregador-login")} />
        <p className={styles.sidebarHint}>O PedeAqui mostra primeiro o que cada pessoa realmente usa.</p>
      </aside>

      <main className={styles.main}>
        {screen === "inicio" ? <HomeScreen go={go} /> : null}
        {screen === "ferramentas" ? <ToolsScreen query={search} setQuery={setSearch} groups={filteredTools} /> : null}
        {screen === "configuracoes" ? <SettingsScreen query={settingSearch} setQuery={setSettingSearch} settings={filteredSettings} go={go} /> : null}
        {screen === "recursos" ? <ResourcesScreen resources={resources} toggle={toggleResource} go={go} /> : null}
        {screen === "entregador-login" ? <DriverLoginScreen go={go} /> : null}
        {screen === "entregador-rota" ? <DriverRouteScreen go={go} /> : null}
      </main>

      <nav className={styles.mobileNav} aria-label="Navegação móvel de prévia">
        <button onClick={() => go("inicio")}><span>🏠</span>Início</button>
        <button><span>🧾</span>Pedidos</button>
        <button><span>🍔</span>Cardápio</button>
        <button><span>💵</span>PDV</button>
        <button onClick={() => go("ferramentas")}><span>⋯</span>Mais</button>
      </nav>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick?: () => void }) {
  return <button type="button" className={`${styles.navButton} ${active ? styles.navActive : ""}`} onClick={onClick}><span>{icon}</span>{label}</button>;
}

function HomeScreen({ go }: { go: (screen: Screen) => void }) {
  return <section className={styles.screen}>
    <PageHeader title="Início" description="O essencial para tocar seu restaurante hoje." badge="Dona Maria · 🟢 Aberto" />
    <section className={styles.readiness}>
      <div><span className={styles.eyebrow}>SEU RESTAURANTE</span><h2>Está quase tudo pronto</h2><p>O PedeAqui detectou sozinho o que já está configurado.</p></div>
      <div className={styles.progressBox}><strong>78% configurado</strong><div className={styles.progressTrack}><span /></div><small>Faltam entrega e impressão</small></div>
    </section>

    <SectionTitle title="Hoje" description="Somente o que importa agora." />
    <div className={styles.metricsGrid}>
      <Metric label="Vendas" value="R$ 426,50" note="+12% vs. ontem" />
      <Metric label="Pedidos" value="18" note="3 em andamento" />
      <Metric label="Ticket médio" value="R$ 23,69" note="Hoje" />
      <Metric label="Precisa de atenção" value="1" note="Entrega atrasada" />
    </div>

    <SectionTitle title="O que você quer fazer?" description="As ações mais usadas sempre à mão." />
    <div className={styles.actionsGrid}>
      <Action icon="🧾" title="Ver pedidos" note="3 aguardando ação" primary />
      <Action icon="🍔" title="Editar cardápio" note="Produtos, preços e adicionais" />
      <Action icon="💵" title="Novo pedido no balcão" note="Abrir PDV" />
      <Action icon="🚚" title="Acompanhar entregas" note="2 pedidos em rota" />
      <Action icon="⚙️" title="Configurar restaurante" note="Horário, pagamentos, entrega..." onClick={() => go("configuracoes")} />
      <Action icon="⋯" title="Mais ferramentas" note="Estoque, financeiro, clientes..." onClick={() => go("ferramentas")} />
    </div>

    <SectionTitle title="Precisa de atenção" description="Sem poluir a tela com informação desnecessária." />
    <div className={styles.panel}>
      <Row title="Pedido #128 está atrasado" description="Entrega prevista há 9 minutos" action="Abrir pedido" />
      <Row title="Configuração da entrega incompleta" description="Falta revisar bairros e taxa" action="Configurar" onClick={() => go("configuracoes")} />
    </div>
  </section>;
}

function ToolsScreen({ query, setQuery, groups }: { query: string; setQuery: (value: string) => void; groups: readonly (readonly [string, readonly (readonly [string, string, string])[]])[] }) {
  return <section className={styles.screen}>
    <PageHeader title="Mais ferramentas" description="As funções menos usadas ficam organizadas, sem atrapalhar o dia a dia." badge="Só o que você pode usar" />
    <Search value={query} onChange={setQuery} placeholder="Procurar ferramenta: estoque, cliente, fornecedor..." />
    {groups.map(([group, tools]) => <div key={group}>
      <SectionTitle title={group} />
      <div className={styles.toolsGrid}>{tools.map(([icon, title, description]) => <div className={styles.toolCard} key={title}><span>{icon}</span><div><strong>{title}</strong><small>{description}</small></div></div>)}</div>
    </div>)}
    {groups.length === 0 ? <EmptyState title="Nenhuma ferramenta encontrada" description="Tente pesquisar por outro nome, como financeiro, estoque ou cliente." /> : null}
  </section>;
}

function SettingsScreen({ query, setQuery, settings, go }: { query: string; setQuery: (value: string) => void; settings: typeof SETTINGS; go: (screen: Screen) => void }) {
  return <section className={styles.screen}>
    <PageHeader title="Configurações" description="Procure pelo que você quer fazer, não pelo nome técnico da função." badge="Modo simples" />
    <Search value={query} onChange={setQuery} placeholder="O que você quer configurar? Ex.: bairro, Pix, horário, WhatsApp..." />
    <SectionTitle title="Configurações do restaurante" description="Tudo organizado pela rotina de quem trabalha no estabelecimento." />
    <div className={styles.settingsGrid}>
      {settings.map(([icon, title, description]) => <button type="button" className={styles.settingCard} key={title}><span>{icon}</span><strong>{title}</strong><small>{description}</small></button>)}
      {!query ? <button type="button" className={`${styles.settingCard} ${styles.featuredCard}`} onClick={() => go("recursos")}><span>✨</span><strong>Recursos do PedeAqui</strong><small>Ative novas funções somente quando precisar.</small></button> : null}
    </div>
    {settings.length === 0 ? <EmptyState title="Não achei essa configuração" description="No produto final, a busca também poderá localizar sinônimos e recursos ainda desativados." /> : null}

    <SectionTitle title="O PedeAqui detectou" description="Pendências que merecem atenção." />
    <div className={styles.panel}>
      <ChecklistRow done title="Dados da loja" description="Tudo certo" />
      <ChecklistRow done title="Pagamentos" description="Dinheiro e cartão habilitados" />
      <ChecklistRow title="Entrega" description="Revise bairros e taxa" action="Resolver" />
      <ChecklistRow title="Impressão automática" description="Ainda não configurada" action="Configurar depois" subtle />
    </div>
  </section>;
}

function ResourcesScreen({ resources, toggle, go }: { resources: Resource[]; toggle: (index: number) => void; go: (screen: Screen) => void }) {
  return <section className={styles.screen}>
    <PageHeader title="Recursos do PedeAqui" description="Escolha o que seu restaurante usa. O que estiver desligado não fica ocupando espaço no menu." action={<button className={styles.secondaryButton} onClick={() => go("configuracoes")}>← Voltar</button>} />
    <div className={styles.notice}><strong>Sem risco:</strong> nesta prévia os botões são apenas visuais. No sistema real, desativar um recurso continuará preservando histórico e respeitando plano, dependências e permissões.</div>
    <div className={styles.panel}>
      {resources.map((resource, index) => <div className={styles.resourceRow} key={resource.name}>
        <div><strong>{resource.name}</strong><small>{resource.description}</small></div>
        {resource.locked ? <span className={styles.lockedBadge}>Sempre ativo</span> : resource.active ? <button className={styles.activeButton} onClick={() => toggle(index)}>Ativo ✓</button> : <button className={styles.primaryButton} onClick={() => toggle(index)}>Ativar</button>}
      </div>)}
    </div>
  </section>;
}

function DriverLoginScreen({ go }: { go: (screen: Screen) => void }) {
  return <section className={styles.driverScreen}>
    <div className={styles.driverAuthCard}>
      <div className={styles.driverBrand}><span>Pede</span>Aqui</div>
      <span className={styles.driverIcon}>🛵</span>
      <h1>Olá, entregador 👋</h1>
      <p>Acesse suas entregas do dia.</p>
      <label>Telefone<input type="tel" placeholder="(19) 99999-9999" /></label>
      <label>PIN de 6 números<input type="password" inputMode="numeric" placeholder="••••••" maxLength={6} /></label>
      <button className={styles.driverPrimary} onClick={() => go("entregador-rota")}>Entrar nas minhas entregas</button>
      <button className={styles.driverLink}>Primeiro acesso? Criar meu PIN</button>
      <div className={styles.driverDivider} />
      <button className={styles.driverLink} onClick={() => go("inicio")}>Sou da loja → Acessar painel</button>
    </div>
  </section>;
}

function DriverRouteScreen({ go }: { go: (screen: Screen) => void }) {
  return <section className={styles.driverRoute}>
    <header className={styles.driverHeader}><div><span className={styles.eyebrow}>MEU ROTEIRO</span><h1>Bom trabalho, Carlos 👋</h1><p>🟢 Em serviço · 2 entregas ativas</p></div><button className={styles.secondaryButton} onClick={() => go("entregador-login")}>Sair</button></header>
    <div className={styles.driverCapacity}><strong>2/4 entregas em uso</strong><span>Você ainda pode assumir mais 2 pedidos.</span></div>
    <SectionTitle title="Minhas entregas" description="A próxima ação aparece sempre em destaque." />
    <div className={styles.deliveryList}>
      <DeliveryCard number="128" customer="Maria Silva" region="Jardim Alvorada" payment="Receber R$ 42,00 em dinheiro" action="Pedido retirado" />
      <DeliveryCard number="131" customer="João Santos" region="Centro" payment="Pagamento confirmado · Cartão" action="Sair para entrega" />
    </div>
  </section>;
}

function DeliveryCard({ number, customer, region, payment, action }: { number: string; customer: string; region: string; payment: string; action: string }) {
  return <article className={styles.deliveryCard}>
    <div className={styles.deliveryTop}><div><span className={styles.eyebrow}>PEDIDO #{number}</span><h2>{customer}</h2><p>📍 {region}</p></div><span className={styles.slaBadge}>18 min</span></div>
    <div className={styles.deliveryInfo}><strong>Pagamento</strong><span>{payment}</span></div>
    <div className={styles.driverActions}><button className={styles.secondaryButton}>🗺️ Abrir no mapa</button><button className={styles.secondaryButton}>💬 WhatsApp</button></div>
    <button className={styles.driverPrimary}>{action}</button>
  </article>;
}

function PageHeader({ title, description, badge, action }: { title: string; description: string; badge?: string; action?: React.ReactNode }) {
  return <header className={styles.pageHeader}><div><h1>{title}</h1><p>{description}</p></div>{action ?? (badge ? <span className={styles.headerBadge}>{badge}</span> : null)}</header>;
}
function SectionTitle({ title, description }: { title: string; description?: string }) { return <div className={styles.sectionTitle}><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className={styles.metricCard}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Action({ icon, title, note, primary, onClick }: { icon: string; title: string; note: string; primary?: boolean; onClick?: () => void }) { return <button type="button" className={`${styles.actionCard} ${primary ? styles.actionPrimary : ""}`} onClick={onClick}><span className={styles.actionIcon}>{icon}</span><strong>{title}</strong><small>{note}</small></button>; }
function Row({ title, description, action, onClick }: { title: string; description: string; action: string; onClick?: () => void }) { return <div className={styles.row}><div><strong>{title}</strong><small>{description}</small></div><button className={styles.primaryButton} onClick={onClick}>{action}</button></div>; }
function ChecklistRow({ done, title, description, action, subtle }: { done?: boolean; title: string; description: string; action?: string; subtle?: boolean }) { return <div className={styles.row}><div className={styles.checkInfo}><span className={`${styles.checkDot} ${done ? styles.checkDone : ""}`}>{done ? "✓" : "!"}</span><div><strong>{title}</strong><small>{description}</small></div></div>{done ? <span className={styles.statusBadge}>Pronto</span> : <button className={subtle ? styles.secondaryButton : styles.primaryButton}>{action}</button>}</div>; }
function Search({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <label className={styles.search}><span>🔎</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className={styles.emptyState}><span>🔎</span><strong>{title}</strong><p>{description}</p></div>; }
