import { z } from "zod";
import type { IntegrationEventEnvelope } from "@/server/integrations/core/contracts";
import type {
  CanonicalExternalOrder,
  CanonicalExternalPayment,
} from "@/server/integrations/core/canonical-external-order";
import { IntegrationProviderError } from "@/server/integrations/core/errors";

const nonEmptyString = z.string().trim().min(1);
const optionalString = z.string().nullable().optional();
const moneyNumber = z.coerce.number().finite().nonnegative();

export const ifoodPollingEventSchema = z.object({
  id: nonEmptyString,
  code: nonEmptyString,
  fullCode: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional(),
  merchantId: z.string().trim().min(1).optional(),
  createdAt: nonEmptyString,
  metadata: z.unknown().optional(),
}).passthrough();

const optionSchema = z.object({
  id: optionalString,
  name: nonEmptyString,
  quantity: z.coerce.number().int().positive(),
  unitPrice: moneyNumber,
  addition: moneyNumber.optional().default(0),
  price: moneyNumber,
}).passthrough();

const itemSchema = z.object({
  id: optionalString,
  uniqueId: optionalString,
  name: nonEmptyString,
  quantity: z.coerce.number().int().positive(),
  unitPrice: moneyNumber,
  price: moneyNumber,
  totalPrice: moneyNumber.optional(),
  observations: optionalString,
  options: z.array(optionSchema).optional().default([]),
}).passthrough();

const paymentMethodSchema = z.object({
  value: moneyNumber,
  type: z.string().trim().min(1).optional(),
  method: z.string().trim().min(1).optional(),
  currency: z.string().trim().min(1).optional(),
}).passthrough();

const benefitSchema = z.object({
  value: moneyNumber,
  sponsorshipValues: z.array(z.object({
    name: nonEmptyString,
    value: moneyNumber,
  }).passthrough()).optional().default([]),
}).passthrough();

const addressSchema = z.object({
  streetName: nonEmptyString,
  streetNumber: z.string().trim().min(1),
  neighborhood: z.string().trim().min(1).optional(),
  district: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(2),
  postalCode: optionalString,
  zipCode: optionalString,
  complement: optionalString,
  reference: optionalString,
  coordinates: z.object({
    latitude: z.coerce.number().finite().nullable().optional(),
    longitude: z.coerce.number().finite().nullable().optional(),
  }).passthrough().optional(),
  latitude: z.coerce.number().finite().nullable().optional(),
  longitude: z.coerce.number().finite().nullable().optional(),
}).passthrough();

export const ifoodOrderDetailsSchema = z.object({
  id: nonEmptyString,
  displayId: optionalString,
  status: z.string().trim().min(1).optional(),
  orderType: nonEmptyString,
  orderTiming: nonEmptyString,
  salesChannel: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  createdAt: nonEmptyString,
  preparationStartDateTime: optionalString,
  isTest: z.boolean().optional(),
  test: z.boolean().optional(),
  extraInfo: optionalString,
  merchant: z.object({
    id: nonEmptyString,
    name: z.string().optional(),
  }).passthrough(),
  customer: z.object({
    name: nonEmptyString,
    phone: z.object({
      number: optionalString,
      localizer: optionalString,
    }).passthrough().optional(),
  }).passthrough(),
  items: z.array(itemSchema).min(1),
  benefits: z.array(benefitSchema).optional().default([]),
  total: z.object({
    subTotal: moneyNumber,
    deliveryFee: moneyNumber,
    benefits: moneyNumber,
    additionalFees: moneyNumber,
    orderAmount: moneyNumber,
  }).passthrough(),
  payments: z.object({
    prepaid: moneyNumber.optional().default(0),
    pending: moneyNumber.optional().default(0),
    methods: z.array(paymentMethodSchema).optional().default([]),
  }).passthrough(),
  delivery: z.object({
    deliveredBy: z.string().trim().min(1).optional(),
    mode: z.string().trim().min(1).optional(),
    pickupCode: optionalString,
    deliveryAddress: addressSchema,
  }).passthrough().optional(),
  scheduling: z.object({
    deliveryDateTimeStart: optionalString,
    deliveryDateTimeEnd: optionalString,
  }).passthrough().optional(),
  schedule: z.object({
    deliveryDateTimeStart: optionalString,
    deliveryDateTimeEnd: optionalString,
  }).passthrough().optional(),
}).passthrough();

export type IfoodPollingEvent = z.infer<typeof ifoodPollingEventSchema>;
export type IfoodOrderDetails = z.infer<typeof ifoodOrderDetailsSchema>;

function cents(value: number): number {
  return Math.round(value * 100);
}

function eventMerchantId(event: IfoodPollingEvent): string | null {
  if (event.merchantId) return event.merchantId;
  if (!event.metadata || typeof event.metadata !== "object" || Array.isArray(event.metadata)) return null;
  const metadata = event.metadata as Record<string, unknown>;
  const candidate = metadata.merchantId ?? metadata.MERCHANT_ID;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export function normalizeIfoodPollingEvent(input: unknown, fallbackMerchantId: string): IntegrationEventEnvelope {
  const parsed = ifoodPollingEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new IntegrationProviderError(
      "iFood polling event payload is invalid",
      "ifood_event_invalid",
      false,
      { cause: parsed.error },
    );
  }

  const occurredAt = new Date(parsed.data.createdAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new IntegrationProviderError("iFood event createdAt is invalid", "ifood_event_created_at_invalid", false);
  }

  const merchantExternalId = eventMerchantId(parsed.data) ?? fallbackMerchantId.trim();
  if (!merchantExternalId) {
    throw new IntegrationProviderError("iFood event merchant is missing", "ifood_event_merchant_missing", false);
  }

  return {
    provider: "ifood",
    capability: "ifood_orders",
    eventId: parsed.data.id,
    eventType: parsed.data.fullCode ?? parsed.data.code,
    occurredAt: occurredAt.toISOString(),
    receivedAt: new Date().toISOString(),
    merchantExternalId,
    payload: parsed.data,
  };
}

function mapOrderType(value: string): CanonicalExternalOrder["orderType"] {
  switch (value.toUpperCase()) {
    case "DELIVERY": return "delivery";
    case "TAKEOUT": return "takeout";
    case "DINE_IN": return "dine_in";
    default:
      throw new IntegrationProviderError(`Unsupported iFood order type ${value}`, "ifood_order_type_unsupported", false);
  }
}

function providerBenefitCents(benefits: IfoodOrderDetails["benefits"]): number {
  return benefits.reduce((total, benefit) => total + benefit.sponsorshipValues.reduce((sum, sponsorship) => {
    return sponsorship.name.toUpperCase() === "MERCHANT" ? sum : sum + cents(sponsorship.value);
  }, 0), 0);
}

function mapPayments(order: IfoodOrderDetails): CanonicalExternalPayment[] {
  const methods: CanonicalExternalPayment[] = order.payments.methods.map((method) => ({
    method: method.method ?? method.type ?? "OTHER",
    prepaid: method.type?.toUpperCase() === "ONLINE",
    amountCents: cents(method.value),
    providerStatus: method.type ?? null,
  }));

  const sponsoredCents = providerBenefitCents(order.benefits);
  if (sponsoredCents > 0) {
    methods.push({
      method: "IFOOD_BENEFIT",
      prepaid: true,
      amountCents: sponsoredCents,
      providerStatus: "SPONSORED_BENEFIT",
    });
  }
  return methods;
}

export function normalizeIfoodOrderDetails(input: unknown, expectedMerchantId: string): CanonicalExternalOrder {
  const parsed = ifoodOrderDetailsSchema.safeParse(input);
  if (!parsed.success) {
    throw new IntegrationProviderError(
      "iFood order details payload is invalid",
      "ifood_order_payload_invalid",
      false,
      { cause: parsed.error },
    );
  }
  const order = parsed.data;
  if (order.merchant.id !== expectedMerchantId) {
    throw new IntegrationProviderError("iFood order merchant does not match integration binding", "ifood_order_merchant_mismatch", false);
  }

  const createdAt = new Date(order.createdAt);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new IntegrationProviderError("iFood order createdAt is invalid", "ifood_order_created_at_invalid", false);
  }

  const timing = order.orderTiming.toUpperCase() === "SCHEDULED" ? "scheduled" : "immediate";
  const scheduledFor = order.scheduling?.deliveryDateTimeStart ?? order.schedule?.deliveryDateTimeStart ?? null;
  if (timing === "scheduled" && !scheduledFor) {
    throw new IntegrationProviderError("Scheduled iFood order has no schedule start", "ifood_schedule_missing", false);
  }

  const items = order.items.map((item) => ({
    externalId: item.uniqueId ?? item.id ?? null,
    name: item.name,
    quantity: item.quantity,
    unitBasePriceCents: cents(item.unitPrice),
    totalCents: cents(item.totalPrice ?? item.price),
    notes: item.observations ?? null,
    modifiers: item.options.map((option) => ({
      externalId: option.id ?? null,
      name: option.name,
      quantity: option.quantity,
      unitPriceCents: cents(option.unitPrice + option.addition),
      totalCents: cents(option.price),
    })),
  }));

  const payments = mapPayments(order);
  const hasProviderPayment = payments.some((payment) => payment.prepaid);
  const deliveredBy = order.delivery?.deliveredBy?.toUpperCase() ?? null;
  const logisticsOwner = mapOrderType(order.orderType) === "delivery"
    ? deliveredBy === "IFOOD" ? "ifood" : deliveredBy === "MERCHANT" ? "merchant" : null
    : null;
  const deliveryAddress = order.delivery?.deliveryAddress;
  const orderType = mapOrderType(order.orderType);

  return {
    provider: "ifood",
    externalMerchantId: order.merchant.id,
    externalOrderId: order.id,
    externalDisplayId: order.displayId ?? null,
    orderType,
    timing,
    createdAt: createdAt.toISOString(),
    scheduledFor,
    recommendedPreparationAt: order.preparationStartDateTime ?? null,
    customer: {
      name: order.customer.name,
      phone: order.customer.phone?.number ?? null,
    },
    deliveryAddress: orderType === "delivery" && deliveryAddress ? {
      street: deliveryAddress.streetName,
      number: deliveryAddress.streetNumber,
      neighborhood: deliveryAddress.neighborhood ?? deliveryAddress.district ?? null,
      city: deliveryAddress.city,
      state: deliveryAddress.state.toUpperCase(),
      postalCode: deliveryAddress.postalCode ?? deliveryAddress.zipCode ?? null,
      complement: deliveryAddress.complement ?? null,
      reference: deliveryAddress.reference ?? null,
      latitude: deliveryAddress.coordinates?.latitude ?? deliveryAddress.latitude ?? null,
      longitude: deliveryAddress.coordinates?.longitude ?? deliveryAddress.longitude ?? null,
    } : null,
    items,
    money: {
      subtotalCents: cents(order.total.subTotal),
      deliveryFeeCents: cents(order.total.deliveryFee),
      discountCents: cents(order.total.benefits),
      additionalFeeCents: cents(order.total.additionalFees),
      totalCents: cents(order.total.orderAmount),
    },
    payments,
    paymentOwner: hasProviderPayment ? "provider" : "merchant",
    logisticsOwner,
    pickupCode: order.delivery?.pickupCode ?? null,
    deliveryCode: null,
    providerMetadata: {
      status: order.status ?? null,
      category: order.category ?? null,
      salesChannel: order.salesChannel ?? null,
      orderTiming: order.orderTiming,
      deliveredBy,
      deliveryMode: order.delivery?.mode ?? null,
      isTest: order.isTest ?? order.test ?? false,
      customerLocalizer: order.customer.phone?.localizer ?? null,
      extraInfo: order.extraInfo ?? null,
    },
  };
}
