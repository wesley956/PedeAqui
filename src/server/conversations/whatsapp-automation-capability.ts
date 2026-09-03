import type { ModuleAvailability } from "@/modules/module-access";
import type { BusinessType, ModuleKey } from "@/modules/module-catalog";
import type { OrderNotificationType } from "@/server/conversations/order-notification-model";

export type WhatsAppAutomationState =
  | "available_disabled"
  | "enabled"
  | "suspended_module"
  | "suspended_entitlement"
  | "suspended_channel"
  | "unavailable_profile"
  | "invalid_configuration";

export type WhatsAppAutomationChannel = {
  configured: boolean;
  enabled: boolean;
  connectionStatus?: string | null;
};

export type WhatsAppAutomationPreferences = Record<OrderNotificationType, boolean>;

export type WhatsAppAutomationCapabilityInput = {
  businessType: BusinessType;
  modules: Pick<Record<ModuleKey, ModuleAvailability>, "conversations" | "production" | "deliveries">;
  channel: WhatsAppAutomationChannel;
  orderNotificationsEnabled: boolean;
  preferences: WhatsAppAutomationPreferences;
  onlinePaymentReady: boolean;
  deliveryOperationEnabled: boolean;
};

export type WhatsAppAutomationCapability = {
  key: OrderNotificationType;
  label: string;
  description: string;
  triggerLabel: string;
  dependencyLabel: string | null;
  state: WhatsAppAutomationState;
  reason: string | null;
  preferenceEnabled: boolean;
  configurable: boolean;
};

type AutomationDefinition = {
  key: OrderNotificationType;
  label: string;
  labels?: Partial<Record<BusinessType, string>>;
  description: string;
  triggerLabel: string;
  module?: "production" | "deliveries";
  requiresOnlinePayment?: boolean;
  requiresDeliveryOperation?: boolean;
};

export const WHATSAPP_ORDER_AUTOMATIONS: readonly AutomationDefinition[] = [
  {
    key: "order_received",
    label: "Pedido recebido",
    description: "Confirma que o pedido entrou no PedeAqui e envia o acompanhamento.",
    triggerLabel: "Quando o pedido é criado",
  },
  {
    key: "order_confirmed",
    label: "Pedido confirmado",
    description: "Avisa somente depois que o pedido foi realmente aceito.",
    triggerLabel: "Quando o pedido é confirmado",
  },
  {
    key: "production_preparing",
    label: "Em preparo",
    labels: { gas: "Em separação", generic_commerce: "Em separação" },
    description: "Acompanha a etapa operacional de preparo ou separação.",
    triggerLabel: "Quando a produção entra em preparo/separação",
    module: "production",
  },
  {
    key: "payment_paid",
    label: "Pagamento confirmado",
    description: "Avisa apenas quando um pagamento online gera confirmação autoritativa.",
    triggerLabel: "Quando o pagamento online é confirmado",
    requiresOnlinePayment: true,
  },
  {
    key: "pickup_ready",
    label: "Pronto para retirada",
    description: "Avisa pedidos de retirada quando a produção fica pronta.",
    triggerLabel: "Quando um pedido de retirada fica pronto",
    module: "production",
  },
  {
    key: "pickup_completed",
    label: "Pedido retirado",
    description: "Confirma a conclusão da retirada pelo cliente.",
    triggerLabel: "Quando a retirada é concluída",
  },
  {
    key: "out_for_delivery",
    label: "Saiu para entrega",
    description: "Avisa somente quando o pedido entra no estado real de saída para entrega.",
    triggerLabel: "Quando o pedido sai para entrega",
    module: "deliveries",
    requiresDeliveryOperation: true,
  },
  {
    key: "delivered",
    label: "Pedido entregue",
    description: "Confirma a entrega somente depois do evento real de entrega.",
    triggerLabel: "Quando a entrega é concluída",
    module: "deliveries",
    requiresDeliveryOperation: true,
  },
  {
    key: "order_canceled",
    label: "Pedido cancelado",
    description: "Avisa somente depois de um cancelamento autoritativo persistido no PedeAqui.",
    triggerLabel: "Quando o pedido é cancelado",
  },
] as const;

function labelFor(definition: AutomationDefinition, businessType: BusinessType) {
  return definition.labels?.[businessType] ?? definition.label;
}

function moduleBlockedState(module: ModuleAvailability): Pick<WhatsAppAutomationCapability, "state" | "reason"> | null {
  if (module.available) return null;
  if (module.reason === "not_supported_by_profile") {
    return { state: "unavailable_profile", reason: "Esta etapa não existe para o perfil operacional desta unidade." };
  }
  if (module.reason === "not_in_plan") {
    return { state: "suspended_entitlement", reason: "O plano atual não libera a capability necessária para esta automação." };
  }
  if (module.reason === "temporarily_unavailable") {
    return { state: "suspended_module", reason: "A capability necessária está temporariamente indisponível." };
  }
  if (module.reason === "permission_denied") {
    return { state: "invalid_configuration", reason: "A resolução modular retornou uma permissão incompatível para esta automação." };
  }
  return { state: "suspended_module", reason: "O módulo necessário está desativado ou com dependência ausente." };
}

function channelReady(channel: WhatsAppAutomationChannel) {
  if (!channel.configured || !channel.enabled) return false;
  const status = channel.connectionStatus;
  return !status || status === "connected";
}

function channelReason(channel: WhatsAppAutomationChannel) {
  if (!channel.configured) return "Conecte o WhatsApp da unidade para liberar o envio.";
  if (!channel.enabled) return "O WhatsApp está desativado nesta unidade.";
  if (channel.connectionStatus === "temporarily_unavailable") return "A conexão com a Meta está temporariamente indisponível.";
  return "A conexão do WhatsApp precisa ser revisada antes de novos envios.";
}

export function resolveWhatsAppAutomationCapability(
  definition: AutomationDefinition,
  input: WhatsAppAutomationCapabilityInput,
): WhatsAppAutomationCapability {
  const preferenceEnabled = Boolean(input.preferences[definition.key]);
  const conversationsBlocked = moduleBlockedState(input.modules.conversations);
  const dependencyLabel = definition.module === "production"
    ? "Produção / fulfillment"
    : definition.module === "deliveries"
      ? "Entregas"
      : definition.requiresOnlinePayment
        ? "Pagamento online com confirmação automática"
        : null;

  const base = {
    key: definition.key,
    label: labelFor(definition, input.businessType),
    description: definition.description,
    triggerLabel: definition.triggerLabel,
    dependencyLabel,
    preferenceEnabled,
  };

  if (conversationsBlocked) {
    return { ...base, ...conversationsBlocked, configurable: false };
  }

  if (definition.module) {
    const dependencyBlocked = moduleBlockedState(input.modules[definition.module]);
    if (dependencyBlocked) return { ...base, ...dependencyBlocked, configurable: false };
  }

  if (definition.requiresDeliveryOperation && !input.deliveryOperationEnabled) {
    return {
      ...base,
      state: "suspended_module",
      reason: "A entrega está desativada na operação desta unidade.",
      configurable: false,
    };
  }

  if (definition.requiresOnlinePayment && !input.onlinePaymentReady) {
    return {
      ...base,
      state: "invalid_configuration",
      reason: "Nenhum pagamento online com confirmação automática está ativo. Dinheiro e cartões presenciais continuam independentes.",
      configurable: false,
    };
  }

  if (!input.orderNotificationsEnabled || !preferenceEnabled) {
    return { ...base, state: "available_disabled", reason: null, configurable: true };
  }

  if (!channelReady(input.channel)) {
    return { ...base, state: "suspended_channel", reason: channelReason(input.channel), configurable: true };
  }

  return { ...base, state: "enabled", reason: null, configurable: true };
}

export function resolveWhatsAppAutomationCapabilities(input: WhatsAppAutomationCapabilityInput) {
  return Object.fromEntries(
    WHATSAPP_ORDER_AUTOMATIONS.map((definition) => [definition.key, resolveWhatsAppAutomationCapability(definition, input)]),
  ) as Record<OrderNotificationType, WhatsAppAutomationCapability>;
}

export function automationCanDispatch(capability: WhatsAppAutomationCapability) {
  return capability.state === "enabled";
}
