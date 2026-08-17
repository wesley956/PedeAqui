export const USER_GUIDE_KEY = "restaurant_getting_started_v1";

export type UserGuideStatus = "not_started" | "in_progress" | "skipped" | "completed";

export type GuideNavigationItem = {
  key: string;
  label: string;
  href: string;
};

export type UserGuideStep = {
  id: string;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
};

type ModuleGuideCopy = {
  title: string;
  description: string;
  actionLabel: string;
};

const moduleCopy: Record<string, ModuleGuideCopy> = {
  dashboard: {
    title: "Comece pelo resumo da operação",
    description: "O Dashboard mostra o que merece atenção agora: pedidos, vendas e sinais da sua operação.",
    actionLabel: "Abrir Dashboard",
  },
  catalog: {
    title: "Monte seu cardápio",
    description: "Crie categorias, produtos, preços e adicionais. É daqui que nasce a experiência que o cliente vê no cardápio online.",
    actionLabel: "Abrir Cardápio",
  },
  settings: {
    title: "Defina como a loja funciona",
    description: "Em Configurações você ajusta horários, entrega, pagamentos, WhatsApp, impressão e outras regras da unidade.",
    actionLabel: "Abrir Configurações",
  },
  conversations: {
    title: "Centralize o atendimento",
    description: "Conversas reúne o atendimento do WhatsApp e ajuda sua equipe a acompanhar o cliente sem perder o contexto.",
    actionLabel: "Abrir Conversas",
  },
  orders: {
    title: "Acompanhe cada pedido",
    description: "Pedidos é o centro do fluxo: confirmação, produção, retirada ou entrega e conclusão do atendimento.",
    actionLabel: "Abrir Pedidos",
  },
  pdv: {
    title: "Venda direto pelo balcão",
    description: "Use o PDV para lançar pedidos presenciais com rapidez e manter tudo na mesma operação.",
    actionLabel: "Abrir PDV",
  },
  cash: {
    title: "Controle o caixa do turno",
    description: "Abra o caixa, acompanhe movimentações e faça o fechamento sem misturar turnos ou operadores.",
    actionLabel: "Abrir Caixa",
  },
  dining: {
    title: "Organize o salão",
    description: "No Salão você acompanha mesas, comandas e o atendimento presencial em tempo real.",
    actionLabel: "Abrir Salão",
  },
  production: {
    title: "Veja o que precisa ser preparado",
    description: "Produção organiza a fila da cozinha para a equipe saber o que preparar e o que já está pronto.",
    actionLabel: "Abrir Produção",
  },
  deliveries: {
    title: "Acompanhe as entregas",
    description: "Veja pedidos aguardando entregador, em rota e concluídos sem perder o vínculo com o pedido original.",
    actionLabel: "Abrir Entregas",
  },
  driver: {
    title: "Seu roteiro fica aqui",
    description: "Meu roteiro mostra ao entregador apenas o que ele precisa para retirar, sair para entrega e concluir a rota.",
    actionLabel: "Abrir Meu roteiro",
  },
  finance: {
    title: "Leia a saúde financeira",
    description: "Financeiro concentra visão de receitas, despesas e indicadores para apoiar as decisões da operação.",
    actionLabel: "Abrir Financeiro",
  },
  fiscal: {
    title: "Mantenha o fiscal organizado",
    description: "Use o módulo Fiscal para acompanhar configurações e documentos fiscais quando fizerem parte da sua operação.",
    actionLabel: "Abrir Fiscal",
  },
  inventory: {
    title: "Evite falta de insumos",
    description: "Estoque ajuda a acompanhar itens, movimentações e consumo ligado à operação.",
    actionLabel: "Abrir Estoque",
  },
  purchases: {
    title: "Organize suas compras",
    description: "Compras conecta fornecedores, recebimentos e reposição para manter a operação abastecida.",
    actionLabel: "Abrir Compras",
  },
  customers: {
    title: "Conheça seus clientes",
    description: "Clientes reúne histórico e relacionamento para você reconhecer quem compra e atender melhor.",
    actionLabel: "Abrir Clientes",
  },
  growth: {
    title: "Traga o cliente de volta",
    description: "Crescimento reúne ferramentas de fidelização, campanhas e benefícios quando você quiser ativá-las.",
    actionLabel: "Abrir Crescimento",
  },
  team: {
    title: "Dê o acesso certo para cada pessoa",
    description: "Equipe permite organizar usuários e funções para cada colaborador enxergar apenas o que precisa.",
    actionLabel: "Abrir Equipe",
  },
};

const roleOrder: Record<string, string[]> = {
  owner: ["dashboard", "catalog", "settings", "conversations", "orders"],
  manager: ["dashboard", "orders", "production", "deliveries", "settings"],
  cashier: ["pdv", "cash", "orders", "customers", "conversations"],
  attendant: ["conversations", "orders", "customers", "pdv", "deliveries"],
  waiter: ["dining", "orders", "pdv", "customers"],
  kitchen: ["production", "orders"],
  driver: ["driver", "deliveries", "orders"],
  financial: ["finance", "fiscal", "inventory", "purchases", "settings"],
};

const fallbackOrder = [
  "dashboard", "orders", "catalog", "settings", "conversations", "pdv", "cash", "dining",
  "production", "deliveries", "driver", "finance", "fiscal", "inventory", "purchases", "customers",
  "growth", "team",
];

export function buildUserGuideSteps(items: readonly GuideNavigationItem[], roleKeys: readonly string[]): UserGuideStep[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const preferred = roleKeys.flatMap((role) => roleOrder[role] ?? []);
  const moduleKeys = [...new Set([...preferred, ...fallbackOrder])]
    .filter((key) => byKey.has(key) && Boolean(moduleCopy[key]))
    .slice(0, 5);

  const modules: UserGuideStep[] = moduleKeys.flatMap((key) => {
    const item = byKey.get(key);
    const copy = moduleCopy[key];
    if (!item || !copy) return [];
    return [{
      id: key,
      href: item.href,
      title: copy.title,
      description: copy.description,
      actionLabel: copy.actionLabel,
    }];
  });

  return [
    {
      id: "welcome",
      title: "Bem-vindo ao PedeAqui 👋",
      description: "Este guia rápido mostra só as áreas importantes para a sua função. Você pode pular agora, continuar depois e abrir o guia novamente quando quiser.",
    },
    ...modules,
    {
      id: "ready",
      title: "Pronto para trabalhar",
      description: "Você já conhece o caminho principal. O PedeAqui vai continuar disponível normalmente e o botão Guia fica sempre à mão caso queira rever estes passos.",
      href: byKey.get("dashboard")?.href ?? modules[0]?.href,
      actionLabel: "Ir para a operação",
    },
  ];
}
