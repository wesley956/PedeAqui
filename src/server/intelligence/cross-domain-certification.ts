import type {
  WhatsAppIntelligenceIntent,
  WhatsAppIntelligenceScenario,
} from "@/server/conversations/whatsapp-intelligence-lab";
import {
  buildWhatsAppIntelligenceMatrix,
} from "@/server/conversations/whatsapp-intelligence-lab";
import type { IntelligenceCapabilityKey } from "@/server/intelligence/capability";
import type { AuthorityOperation } from "@/server/intelligence/authority";
import type {
  UnifiedRouterDecision,
  UnifiedRouterTool,
} from "@/server/intelligence/unified-router";

export const CROSS_DOMAIN_CERTIFICATION_VERSION = "int-13-v1" as const;

export type CertificationBusinessType = "restaurant" | "gas" | "generic_commerce";
export type CertificationConversationMode = "bot" | "waiting_agent" | "human";
export type CertificationSideEffect = "none" | "prepare" | "mutate" | "handoff";
export type CertificationConfirmation = "none" | "explicit";
export type CertificationIdempotency =
  | "read_only"
  | "required"
  | "canonical_source_cart"
  | "canonical_transition";

export type CrossDomainCertificationContext = {
  tenant: "scenario-tenant";
  store: "scenario-store";
  channel: "whatsapp";
  businessType: CertificationBusinessType;
  conversationMode: CertificationConversationMode;
};

export type CrossDomainCertificationExpectation = {
  interpreterIntent: WhatsAppIntelligenceIntent;
  routerIntent: UnifiedRouterDecision["intent"];
  tool: UnifiedRouterTool;
  capability: IntelligenceCapabilityKey | null;
  authority: AuthorityOperation | "create_internal_order" | null;
  canonicalService: string;
  audienceProjection: string;
  sideEffect: CertificationSideEffect;
  confirmation: CertificationConfirmation;
  idempotency: CertificationIdempotency;
  result: string;
};

export type CrossDomainCertificationScenario = WhatsAppIntelligenceScenario & {
  certificationVersion: typeof CROSS_DOMAIN_CERTIFICATION_VERSION;
  context: CrossDomainCertificationContext;
  expected: CrossDomainCertificationExpectation;
};

export type CertificationMismatchField =
  | "intent"
  | "tool"
  | "capability"
  | "authority"
  | "tenant"
  | "projection"
  | "price"
  | "payment"
  | "delivery"
  | "growth"
  | "status"
  | "confirmation";

export type CertificationMismatch = {
  scenarioId: string;
  field: CertificationMismatchField;
  expected: unknown;
  actual: unknown;
  critical: boolean;
};

const CRITICAL_MISMATCH_FIELDS = new Set<CertificationMismatchField>([
  "tenant",
  "price",
  "payment",
  "delivery",
  "growth",
  "status",
  "authority",
  "confirmation",
]);

const READ_ONLY_INTENTS = new Set<WhatsAppIntelligenceIntent>([
  "menu",
  "menu_link",
  "product_question",
  "price_question",
  "flavor_question",
  "track_start",
  "track_code",
  "hours",
  "payment",
  "delivery",
  "social_ack",
  "ignore_media",
  "clarify",
  "unknown",
]);

function isOrderPhase(scenario: WhatsAppIntelligenceScenario) {
  return scenario.phase.startsWith("order_");
}

function routerIntentFor(scenario: WhatsAppIntelligenceScenario): UnifiedRouterDecision["intent"] {
  if (isOrderPhase(scenario)) {
    if (scenario.intent === "handoff" || scenario.intent === "track_start" || scenario.intent === "track_code" || scenario.intent === "menu") {
      return scenario.intent;
    }
    return "order_continue";
  }
  if (scenario.phase === "awaiting_tracking_code") return "track_code";
  switch (scenario.intent) {
    case "menu":
    case "menu_link":
    case "order_start":
    case "track_start":
    case "track_code":
    case "handoff":
    case "hours":
    case "payment":
    case "delivery":
      return scenario.intent;
    default:
      return "unknown";
  }
}

function toolFor(scenario: WhatsAppIntelligenceScenario, routerIntent: UnifiedRouterDecision["intent"]): UnifiedRouterTool {
  if (routerIntent === "order_continue" || routerIntent === "order_start") return "whatsapp_order";
  if (routerIntent === "track_start" || routerIntent === "track_code") return "order_tracking";
  if (routerIntent === "handoff") return "human_handoff";
  if (routerIntent === "menu_link" || scenario.intent === "product_question" || scenario.intent === "price_question" || scenario.intent === "flavor_question") return "catalog";
  if (routerIntent === "payment" || routerIntent === "delivery" || routerIntent === "hours" || routerIntent === "menu") return "conversation_info";
  return "fallback";
}

function capabilityFor(tool: UnifiedRouterTool): IntelligenceCapabilityKey | null {
  if (tool === "catalog") return "canSearchCatalog";
  if (tool === "whatsapp_order") return "canCreateOrder";
  if (tool === "growth_benefits") return "canShowGrowthBenefits";
  if (tool === "conversation_info" || tool === "order_tracking" || tool === "fallback") return "canAutoReply";
  return null;
}

function authorityFor(tool: UnifiedRouterTool): AuthorityOperation | "create_internal_order" | null {
  if (tool === "order_tracking") return "view_order";
  return null;
}

function canonicalServiceFor(scenario: WhatsAppIntelligenceScenario, tool: UnifiedRouterTool) {
  switch (scenario.intent) {
    case "product_question":
    case "price_question":
    case "flavor_question":
      return "IntelligenceCatalogAdapter / PublicMenuService / PricingService";
    case "payment":
      return "PaymentAdapter / StorePaymentMethodService";
    case "delivery":
      return "DeliveryAdapter / DeliveryQuoteService";
    case "track_start":
    case "track_code":
      return "OrderWorkflowAdapter / PublicOrderService";
    case "address":
      return "CheckoutService.saveAddress";
    case "composition":
    case "order_item":
      return "CartService";
    case "order_edit":
      return "CartService / CheckoutService / OrderService canonical transition";
    case "confirmation":
      return "OrderService.createFromCheckout";
    case "handoff":
      return "conversation_transition_internal";
    default:
      break;
  }
  if (tool === "catalog") return "IntelligenceCatalogAdapter / PublicMenuService";
  if (tool === "whatsapp_order") return "WhatsAppDirectOrderOrchestrator / canonical order services";
  if (tool === "order_tracking") return "OrderWorkflowAdapter / PublicOrderService";
  if (tool === "human_handoff") return "conversation_transition_internal";
  return "ConversationGreetingService / bot-menu";
}

function sideEffectFor(scenario: WhatsAppIntelligenceScenario): CertificationSideEffect {
  if (scenario.intent === "handoff") return "handoff";
  if (scenario.intent === "confirmation") return "mutate";
  if (["order_start", "order_item", "composition", "order_edit", "address"].includes(scenario.intent)) return "prepare";
  return READ_ONLY_INTENTS.has(scenario.intent) ? "none" : "none";
}

function idempotencyFor(scenario: WhatsAppIntelligenceScenario): CertificationIdempotency {
  if (scenario.intent === "confirmation") return "canonical_source_cart";
  if (scenario.intent === "handoff" || scenario.intent === "order_edit") return "canonical_transition";
  if (["order_start", "order_item", "composition", "address"].includes(scenario.intent)) return "required";
  return "read_only";
}

function audienceProjectionFor(scenario: WhatsAppIntelligenceScenario) {
  if (scenario.intent === "track_start" || scenario.intent === "track_code") return "customer-safe order projection";
  if (scenario.intent === "payment") return "customer payment-method projection";
  if (scenario.intent === "delivery") return "customer delivery projection";
  if (["product_question", "price_question", "flavor_question", "menu_link"].includes(scenario.intent)) return "public catalog projection";
  if (scenario.intent === "address") return "customer-owned address projection";
  return "customer conversation projection";
}

export function certifyWhatsAppScenario(scenario: WhatsAppIntelligenceScenario): CrossDomainCertificationScenario {
  const routerIntent = routerIntentFor(scenario);
  const tool = toolFor(scenario, routerIntent);
  return {
    ...scenario,
    certificationVersion: CROSS_DOMAIN_CERTIFICATION_VERSION,
    context: {
      tenant: "scenario-tenant",
      store: "scenario-store",
      channel: "whatsapp",
      businessType: "restaurant",
      conversationMode: "bot",
    },
    expected: {
      interpreterIntent: scenario.intent,
      routerIntent,
      tool,
      capability: capabilityFor(tool),
      authority: authorityFor(tool),
      canonicalService: canonicalServiceFor(scenario, tool),
      audienceProjection: audienceProjectionFor(scenario),
      sideEffect: sideEffectFor(scenario),
      confirmation: scenario.intent === "confirmation" ? "explicit" : "none",
      idempotency: idempotencyFor(scenario),
      result: scenario.expectedAction,
    },
  };
}

export function buildCrossDomainCertificationMatrix(): CrossDomainCertificationScenario[] {
  return buildWhatsAppIntelligenceMatrix().map(certifyWhatsAppScenario);
}

export function evaluateRouterDecision(
  scenario: CrossDomainCertificationScenario,
  actual: UnifiedRouterDecision,
): CertificationMismatch[] {
  const checks: Array<[CertificationMismatchField, unknown, unknown]> = [
    ["intent", scenario.expected.routerIntent, actual.intent],
    ["tool", scenario.expected.tool, actual.tool],
    ["capability", scenario.expected.capability, actual.requiredCapability],
    ["authority", scenario.expected.authority, actual.authorityOperation],
  ];
  return checks.flatMap(([field, expected, received]) => expected === received ? [] : [{
    scenarioId: scenario.id,
    field,
    expected,
    actual: received,
    critical: scenario.risk === "critical" || CRITICAL_MISMATCH_FIELDS.has(field),
  }]);
}

export type CrossDomainParitySuite = {
  domain: "catalog_price" | "payment_methods" | "delivery_quote" | "growth" | "order_status" | "workflow_notifications";
  intelligenceContract: string;
  canonicalSource: string;
  criticalFields: readonly CertificationMismatchField[];
};

export const CROSS_DOMAIN_PARITY_SUITES: readonly CrossDomainParitySuite[] = [
  {
    domain: "catalog_price",
    intelligenceContract: "IntelligenceCatalogAdapter.search/productDetails/revalidatePrice",
    canonicalSource: "PublicMenuService + PricingService + PromotionService",
    criticalFields: ["tenant", "price", "projection"],
  },
  {
    domain: "payment_methods",
    intelligenceContract: "PaymentAdapter.methods",
    canonicalSource: "StorePaymentMethodService.listForStore",
    criticalFields: ["tenant", "payment", "projection"],
  },
  {
    domain: "delivery_quote",
    intelligenceContract: "DeliveryAdapter.quote",
    canonicalSource: "DeliveryQuoteService.quote",
    criticalFields: ["tenant", "delivery", "projection"],
  },
  {
    domain: "growth",
    intelligenceContract: "loadCustomerBenefits(channel=whatsapp)",
    canonicalSource: "growth_customer_benefits_internal + private.resolve_growth_benefits",
    criticalFields: ["tenant", "growth", "projection"],
  },
  {
    domain: "order_status",
    intelligenceContract: "OrderWorkflowAdapter.status/summary/tracking",
    canonicalSource: "OrderService + PublicOrderService + OrderPresentationService",
    criticalFields: ["tenant", "status", "authority", "projection"],
  },
  {
    domain: "workflow_notifications",
    intelligenceContract: "OrderWorkflowAdapter.workflow",
    canonicalSource: "OrderWorkflowSettingsService + official notification checkpoints",
    criticalFields: ["tenant", "status", "projection"],
  },
] as const;

export function compareParityValue(input: {
  scenarioId: string;
  field: CertificationMismatchField;
  intelligenceValue: unknown;
  canonicalValue: unknown;
}): CertificationMismatch[] {
  return JSON.stringify(input.intelligenceValue) === JSON.stringify(input.canonicalValue) ? [] : [{
    scenarioId: input.scenarioId,
    field: input.field,
    expected: input.canonicalValue,
    actual: input.intelligenceValue,
    critical: CRITICAL_MISMATCH_FIELDS.has(input.field),
  }];
}

export function summarizeCrossDomainCertification(mismatches: readonly CertificationMismatch[] = []) {
  const matrix = buildCrossDomainCertificationMatrix();
  return {
    version: CROSS_DOMAIN_CERTIFICATION_VERSION,
    totalScenarios: matrix.length,
    criticalScenarios: matrix.filter((scenario) => scenario.risk === "critical").length,
    paritySuites: CROSS_DOMAIN_PARITY_SUITES.length,
    mismatches: mismatches.length,
    criticalMismatches: mismatches.filter((mismatch) => mismatch.critical).length,
    gate: mismatches.some((mismatch) => mismatch.critical) ? "NO-GO" as const : "GO" as const,
  };
}
