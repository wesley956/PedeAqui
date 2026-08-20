import type { BusinessType } from "@/modules/module-catalog";

export type BusinessVocabulary = {
  businessLabel: string;
  unitLabel: string;
  catalogLabel: string;
  productSingular: string;
  productPlural: string;
  productionLabel: string;
  productionDescription: string;
  productionFilterLabel: string;
  noStationsTitle: string;
  noStationsBody: string;
  noProductionTitle: string;
  queuedLabel: string;
  preparingLabel: string;
  readyLabel: string;
  startProductionLabel: string;
  markReadyLabel: string;
  noProductionActionLabel: string;
};

const VOCABULARY: Record<BusinessType, BusinessVocabulary> = {
  restaurant: {
    businessLabel: "Restaurante / Lanchonete",
    unitLabel: "restaurante",
    catalogLabel: "Cardápio",
    productSingular: "produto",
    productPlural: "produtos",
    productionLabel: "Produção",
    productionDescription: "Acompanhe o preparo dos pedidos em tempo real.",
    productionFilterLabel: "Filtrar produção por estação",
    noStationsTitle: "Nenhuma estação de produção ativa",
    noStationsBody: "O painel em Todas continua exibindo pedidos. Configure estações em Configurações → Impressões para usar filtros como cozinha, chapa ou fritura.",
    noProductionTitle: "Nenhum pedido em produção",
    queuedLabel: "Na fila",
    preparingLabel: "Em preparo",
    readyLabel: "Pronto",
    startProductionLabel: "Iniciar preparo",
    markReadyLabel: "Marcar como pronto",
    noProductionActionLabel: "Sem ação de produção pendente",
  },
  gas: {
    businessLabel: "Revenda de gás",
    unitLabel: "revenda",
    catalogLabel: "Catálogo",
    productSingular: "produto",
    productPlural: "produtos",
    productionLabel: "Separação",
    productionDescription: "Acompanhe a separação dos pedidos antes da retirada ou entrega.",
    productionFilterLabel: "Filtrar separação por estação",
    noStationsTitle: "Nenhuma estação de separação ativa",
    noStationsBody: "O painel em Todas continua exibindo pedidos. Estações são opcionais e podem ser configuradas quando ajudarem a sua operação.",
    noProductionTitle: "Nenhum pedido aguardando separação",
    queuedLabel: "Aguardando separação",
    preparingLabel: "Separando",
    readyLabel: "Separado",
    startProductionLabel: "Iniciar separação",
    markReadyLabel: "Marcar como separado",
    noProductionActionLabel: "Sem ação de separação pendente",
  },
  generic_commerce: {
    businessLabel: "Outro comércio",
    unitLabel: "unidade",
    catalogLabel: "Catálogo",
    productSingular: "item",
    productPlural: "itens",
    productionLabel: "Operação",
    productionDescription: "Acompanhe a etapa operacional dos pedidos em tempo real.",
    productionFilterLabel: "Filtrar operação por estação",
    noStationsTitle: "Nenhuma estação operacional ativa",
    noStationsBody: "O painel em Todas continua exibindo pedidos. Configure estações somente se elas ajudarem a organizar a operação.",
    noProductionTitle: "Nenhum pedido em operação",
    queuedLabel: "Na fila",
    preparingLabel: "Em andamento",
    readyLabel: "Pronto",
    startProductionLabel: "Iniciar operação",
    markReadyLabel: "Marcar como pronto",
    noProductionActionLabel: "Sem ação operacional pendente",
  },
};

export function businessVocabulary(businessType: BusinessType): BusinessVocabulary {
  return VOCABULARY[businessType] ?? VOCABULARY.generic_commerce;
}

export function productionStatusLabelForBusiness(
  status: "pending_confirmation" | "queued" | "preparing" | "ready" | "canceled" | "not_required",
  businessType: BusinessType,
) {
  const vocabulary = businessVocabulary(businessType);
  if (status === "pending_confirmation") return "Aguardando confirmação";
  if (status === "queued") return vocabulary.queuedLabel;
  if (status === "preparing") return vocabulary.preparingLabel;
  if (status === "ready") return vocabulary.readyLabel;
  if (status === "canceled") return "Cancelado";
  return businessType === "restaurant" ? "Sem produção" : "Não necessário";
}
