import { businessVocabulary } from "@/modules/business-vocabulary";
import type { BusinessType } from "@/modules/module-catalog";

export const USER_GUIDE_KEY = "pedeaqui_smart_onboarding_v2";

export type UserGuideStatus = "not_started" | "in_progress" | "skipped" | "completed";
export type GuideNavigationItem = { key: string; label: string; href: string };
export type GuideTaskState = "done" | "todo" | "info";
export type GuideReadiness = {
  storeProfileComplete: boolean;
  storeSlug: string | null;
  productCount: number;
  hoursCount: number;
  paymentMethodCount: number;
  deliveryConfigured: boolean;
  driverCount: number;
  driverMobileAccessCount: number;
  orderCount: number;
};
export type UserGuideStep = {
  id: string;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
  state: GuideTaskState;
  completionLabel?: string;
  tip?: string;
};

type ModuleGuideCopy = { title: string; description: string; actionLabel: string };

const emptyReadiness: GuideReadiness = {
  storeProfileComplete: false,
  storeSlug: null,
  productCount: 0,
  hoursCount: 0,
  paymentMethodCount: 0,
  deliveryConfigured: false,
  driverCount: 0,
  driverMobileAccessCount: 0,
  orderCount: 0,
};

const moduleCopy: Record<string, ModuleGuideCopy> = {
  dashboard: { title: "Entenda o resumo da operação", description: "O Dashboard mostra pedidos, vendas e o que merece atenção agora.", actionLabel: "Abrir Dashboard" },
  catalog: { title: "Aprenda a cuidar do cardápio", description: "Cadastre e edite categorias, produtos, preços, adicionais e disponibilidade.", actionLabel: "Abrir Cardápio" },
  settings: { title: "Conheça as configurações", description: "Horários, entrega, pagamentos, WhatsApp, impressão e regras da unidade ficam aqui.", actionLabel: "Abrir Configurações" },
  conversations: { title: "Centralize o atendimento", description: "Conversas reúne o atendimento e mantém o contexto do cliente em um só lugar.", actionLabel: "Abrir Conversas" },
  orders: { title: "Acompanhe cada pedido", description: "Pedidos é o centro do fluxo: confirmação, produção ou separação, retirada ou entrega e conclusão.", actionLabel: "Abrir Pedidos" },
  pdv: { title: "Venda direto pelo balcão", description: "Use o PDV para lançar pedidos presenciais rapidamente e manter tudo na mesma operação.", actionLabel: "Abrir PDV" },
  cash: { title: "Controle o caixa do turno", description: "Abra, acompanhe movimentações e faça o fechamento sem misturar turnos ou operadores.", actionLabel: "Abrir Caixa" },
  dining: { title: "Organize o salão", description: "Acompanhe mesas, comandas e o atendimento presencial em tempo real.", actionLabel: "Abrir Salão" },
  production: { title: "Veja o que precisa ser preparado", description: "A fila de produção mostra o que precisa ser feito e o que já está pronto.", actionLabel: "Abrir Produção" },
  deliveries: { title: "Acompanhe as entregas", description: "Veja pedidos aguardando entregador, em rota e concluídos sem perder o vínculo com o pedido.", actionLabel: "Abrir Entregas" },
  driver: { title: "Use seu roteiro", description: "Meu roteiro reúne endereço, itens, cobrança e as ações de retirada, saída e entrega.", actionLabel: "Abrir Meu roteiro" },
  finance: { title: "Leia a saúde financeira", description: "Financeiro concentra receitas, despesas e indicadores para apoiar decisões.", actionLabel: "Abrir Financeiro" },
  fiscal: { title: "Mantenha o fiscal organizado", description: "Acompanhe configurações e documentos fiscais quando fizerem parte da operação.", actionLabel: "Abrir Fiscal" },
  inventory: { title: "Evite falta de itens", description: "Estoque ajuda a acompanhar saldos, movimentações e consumo ligado à operação.", actionLabel: "Abrir Estoque" },
  gas_containers: { title: "Controle seus vasilhames", description: "Acompanhe cascos cheios, vazios e em rota sem misturar esse saldo com o estoque dos produtos.", actionLabel: "Abrir Vasilhames" },
  purchases: { title: "Organize suas compras", description: "Compras conecta fornecedores, recebimentos e reposição.", actionLabel: "Abrir Compras" },
  customers: { title: "Conheça seus clientes", description: "Clientes reúne histórico e relacionamento para facilitar o atendimento.", actionLabel: "Abrir Clientes" },
  growth: { title: "Traga o cliente de volta", description: "Crescimento reúne fidelização, campanhas e benefícios.", actionLabel: "Abrir Crescimento" },
  team: { title: "Dê o acesso certo para cada pessoa", description: "Equipe organiza usuários e funções para cada colaborador ver somente o necessário.", actionLabel: "Abrir Equipe" },
};

const roleOrder: Record<string, string[]> = {
  manager: ["dashboard", "orders", "production", "deliveries", "settings"],
  cashier: ["pdv", "cash", "orders", "customers", "conversations"],
  attendant: ["conversations", "orders", "customers", "pdv", "deliveries"],
  waiter: ["dining", "orders", "pdv", "customers"],
  kitchen: ["production", "orders"],
  driver: ["driver"],
  financial: ["finance", "fiscal", "inventory", "gas_containers", "purchases"],
};

const fallbackOrder = ["dashboard", "orders", "catalog", "settings", "conversations", "pdv", "cash", "dining", "production", "deliveries", "driver", "finance", "fiscal", "inventory", "gas_containers", "purchases", "customers", "growth", "team"];

function copyFor(key: string, businessType: BusinessType): ModuleGuideCopy | undefined {
  const base = moduleCopy[key];
  if (!base) return undefined;
  if (businessType === "gas" && key === "catalog") return { title: "Aprenda a cuidar do catálogo", description: "Cadastre botijões, água, acessórios, preços, troca/casco e disponibilidade.", actionLabel: "Abrir Catálogo" };
  if (businessType === "gas" && key === "production") return { title: "Organize a separação", description: "Separação mostra os pedidos que precisam ser organizados antes da retirada ou saída para entrega.", actionLabel: "Abrir Separação" };
  if (businessType === "generic_commerce" && key === "catalog") return { title: "Aprenda a cuidar do catálogo", description: "Cadastre produtos, categorias, preços e opções para a vitrine pública.", actionLabel: "Abrir Catálogo" };
  return base;
}

function task(state: boolean, step: Omit<UserGuideStep, "state">): UserGuideStep {
  return { ...step, state: state ? "done" : "todo" };
}

function ownerSetupSteps(byKey: Map<string, GuideNavigationItem>, businessType: BusinessType, readiness: GuideReadiness): UserGuideStep[] {
  const has = (key: string) => byKey.has(key);
  const catalogLabel = businessType === "restaurant" ? "cardápio" : "catálogo";
  const productLabel = businessType === "gas" ? "primeiro produto ou botijão" : "primeiro produto";
  const steps: UserGuideStep[] = [];

  if (has("settings")) {
    steps.push(task(readiness.storeProfileComplete, {
      id: "store-profile",
      title: "Confira os dados da loja",
      description: "Nome, telefone e localização ajudam o cliente e deixam os próximos recursos funcionando com o contexto correto.",
      href: "/configuracoes",
      actionLabel: "Revisar dados da loja",
      completionLabel: "Dados principais conferidos",
      tip: "Comece por aqui. O restante do PedeAqui usa esses dados como base.",
    }));
  }

  if (has("catalog")) {
    steps.push(task(readiness.productCount > 0, {
      id: "first-product",
      title: `Cadastre seu ${productLabel}`,
      description: `O ${catalogLabel} só fica útil para venda quando existe pelo menos um item ativo com preço definido.`,
      href: byKey.get("catalog")?.href,
      actionLabel: businessType === "restaurant" ? "Cadastrar no cardápio" : "Cadastrar no catálogo",
      completionLabel: `${readiness.productCount} item(ns) ativo(s)`,
      tip: businessType === "gas" ? "Se vender gás, configure também se o item permite troca de vasilhame ou produto + casco." : "Comece com um item real; depois você pode completar fotos, adicionais e detalhes.",
    }));
  }

  if (has("settings")) {
    steps.push(task(readiness.hoursCount > 0, {
      id: "business-hours",
      title: "Defina o horário de atendimento",
      description: "O horário informa quando sua operação pode receber pedidos e evita vender fora do período planejado.",
      href: "/configuracoes/horarios",
      actionLabel: "Configurar horários",
      completionLabel: `${readiness.hoursCount} faixa(s) ativa(s)`,
    }));

    steps.push(task(readiness.paymentMethodCount > 0, {
      id: "payment-methods",
      title: "Escolha como o cliente pode pagar",
      description: "Revise dinheiro, cartão e PIX para que o checkout mostre somente as opções que sua loja realmente aceita.",
      href: "/configuracoes/pagamentos",
      actionLabel: "Configurar pagamentos",
      completionLabel: `${readiness.paymentMethodCount} forma(s) habilitada(s)`,
      tip: "PIX online só deve aparecer quando a integração estiver realmente pronta.",
    }));
  }

  if (has("deliveries")) {
    steps.push(task(readiness.deliveryConfigured, {
      id: "delivery-settings",
      title: "Configure sua entrega",
      description: "Defina taxa, prazo, bairros e limites para o PedeAqui calcular a entrega do jeito certo.",
      href: "/configuracoes/entrega",
      actionLabel: "Configurar entrega",
      completionLabel: readiness.deliveryConfigured ? "Regras de entrega salvas" : "Ainda não configurado",
    }));
  }

  if (has("driver")) {
    const driverReady = readiness.driverCount > 0 && readiness.driverMobileAccessCount > 0;
    steps.push(task(driverReady, {
      id: "driver-access",
      title: "Cadastre e libere um entregador",
      description: "Cadastre o entregador, confirme o telefone e gere o acesso por WhatsApp para ele criar o PIN e abrir o próprio roteiro.",
      href: "/configuracoes/entregadores",
      actionLabel: "Preparar entregador",
      completionLabel: `${readiness.driverCount} cadastrado(s) · ${readiness.driverMobileAccessCount} com acesso`,
      tip: "O entregador não precisa de e-mail: depois do primeiro acesso ele entra com telefone + PIN.",
    }));
  }

  if (has("orders")) {
    steps.push(task(readiness.orderCount > 0, {
      id: "first-order",
      title: "Faça o primeiro pedido de ponta a ponta",
      description: "Use um pedido real ou de teste para conferir como ele entra, é preparado ou separado, pago e concluído.",
      href: byKey.get("orders")?.href,
      actionLabel: "Acompanhar pedidos",
      completionLabel: `${readiness.orderCount} pedido(s) registrado(s)`,
      tip: readiness.storeSlug ? `Sua vitrine pública já possui endereço próprio (${readiness.storeSlug}). Use-a para simular a experiência do cliente.` : "Abra a vitrine pública da loja e faça um pedido como se fosse cliente.",
    }));
  }

  return steps.slice(0, 7);
}

function operationalSteps(byKey: Map<string, GuideNavigationItem>, roleKeys: readonly string[], businessType: BusinessType): UserGuideStep[] {
  const preferred = roleKeys.flatMap((role) => roleOrder[role] ?? []);
  const moduleKeys = [...new Set([...preferred, ...fallbackOrder])]
    .filter((key) => byKey.has(key) && Boolean(copyFor(key, businessType)))
    .slice(0, 5);
  return moduleKeys.flatMap((key) => {
    const item = byKey.get(key);
    const copy = copyFor(key, businessType);
    if (!item || !copy) return [];
    return [{ id: `learn-${key}`, href: item.href, title: copy.title, description: copy.description, actionLabel: copy.actionLabel, state: "info" as const }];
  });
}

export function buildUserGuideSteps(
  items: readonly GuideNavigationItem[],
  roleKeys: readonly string[],
  businessType: BusinessType = "restaurant",
  readiness: GuideReadiness = emptyReadiness,
): UserGuideStep[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const vocabulary = businessVocabulary(businessType);
  const isOwner = roleKeys.includes("owner");
  const setup = isOwner ? ownerSetupSteps(byKey, businessType, readiness) : operationalSteps(byKey, roleKeys, businessType);

  return [
    {
      id: "welcome",
      title: isOwner ? "Vamos deixar sua operação pronta" : "Seu guia de trabalho no PedeAqui",
      description: isOwner
        ? `O PedeAqui verifica o que já existe nesta ${vocabulary.unitLabel} e marca sozinho o que está pronto. Você só precisa cuidar das pendências.`
        : `Este guia mostra somente o que importa para a sua função nesta ${vocabulary.unitLabel}. Você pode abrir cada área e voltar aqui quando quiser.`,
      state: "info",
    },
    ...setup,
    {
      id: "ready",
      title: isOwner ? "Operação pronta para evoluir" : "Pronto para trabalhar",
      description: isOwner
        ? "Quando as tarefas acima estiverem concluídas, sua base operacional estará pronta. O botão Guia continua disponível para revisar qualquer etapa."
        : "Você já conhece o caminho principal. O Guia fica sempre disponível para revisar essas áreas.",
      href: byKey.get("dashboard")?.href ?? setup[0]?.href,
      actionLabel: "Ir para a operação",
      state: "info",
    },
  ];
}

export function guideProgress(steps: readonly UserGuideStep[]) {
  const actionable = steps.filter((step) => step.state !== "info");
  const completed = actionable.filter((step) => step.state === "done").length;
  const total = actionable.length;
  return {
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
  };
}
