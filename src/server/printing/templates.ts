import { z } from "zod";

const modifierSchema = z.object({ group: z.string().nullable().optional(), name: z.string(), unit_price_cents: z.number().optional(), quantity: z.number().int().positive().default(1) });
const itemSchema = z.object({
  order_item_id: z.string().optional(),
  product_id: z.string().nullable().optional(),
  name: z.string(),
  quantity: z.number().int().positive(),
  note: z.string().nullable().optional(),
  unit_total_cents: z.number().optional(),
  line_total_cents: z.number().optional(),
  modifiers: z.array(modifierSchema).default([]),
});

export const printPayloadSchema = z.object({
  order: z.object({
    id: z.string(),
    display_number: z.number(),
    channel: z.string(),
    fulfillment_type: z.string(),
    customer_name: z.string().nullable().optional(),
    customer_phone: z.string().nullable().optional(),
    address: z.object({
      street: z.string().nullable().optional(), number: z.string().nullable().optional(),
      complement: z.string().nullable().optional(), district: z.string().nullable().optional(),
      city: z.string().nullable().optional(), state: z.string().nullable().optional(),
      reference: z.string().nullable().optional(),
    }).optional(),
    subtotal_cents: z.number(), discount_cents: z.number(), delivery_fee_cents: z.number(), total_cents: z.number(),
    payment_method: z.string().nullable().optional(), cash_change_for_cents: z.number().nullable().optional(),
    created_at: z.string(), confirmed_at: z.string().nullable().optional(), scheduled_for: z.string().nullable().optional(), timezone: z.string().optional(),
  }),
  station: z.object({ id: z.string(), name: z.string(), code: z.string(), kind: z.string() }),
  items: z.array(itemSchema),
});

export const orderPrintPreferencesSchema = z.object({
  show_customer_name: z.boolean().default(true),
  show_customer_phone: z.boolean().default(true),
  show_delivery_address: z.boolean().default(true),
  show_item_modifiers: z.boolean().default(true),
  show_item_notes: z.boolean().default(true),
  show_prices: z.boolean().default(true),
  show_payment: z.boolean().default(true),
  show_footer: z.boolean().default(true),
  footer_text: z.string().trim().max(120).nullable().default(null),
});

export const DEFAULT_ORDER_PRINT_PREFERENCES = orderPrintPreferencesSchema.parse({});

export type PrintPayload = z.infer<typeof printPayloadSchema>;
export type OrderPrintPreferences = z.infer<typeof orderPrintPreferencesSchema>;
export type PrintDocumentType = "kitchen" | "expedition" | "counter" | "receipt" | "custom";

type PrintModifier = PrintPayload["items"][number]["modifiers"][number];

export function resolveOrderPrintPreferences(value: unknown): OrderPrintPreferences {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return orderPrintPreferencesSchema.parse({
    show_customer_name: source.show_customer_name ?? true,
    show_customer_phone: source.show_customer_phone ?? true,
    show_delivery_address: source.show_delivery_address ?? true,
    show_item_modifiers: source.show_item_modifiers ?? true,
    show_item_notes: source.show_item_notes ?? true,
    show_prices: source.show_prices ?? true,
    show_payment: source.show_payment ?? true,
    show_footer: source.show_footer ?? true,
    footer_text: source.footer_text ?? null,
  });
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(cents / 100)
    .replace(/[\u00a0\u202f]/g, " ");
}
function clip(value: string, width: number) { return value.length <= width ? value : `${value.slice(0, Math.max(0, width - 1))}…`; }
function line(char: string, width: number) { return char.repeat(width); }
function center(value: string, width: number) {
  const text = clip(value, width);
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return `${" ".repeat(left)}${text}`;
}
function pair(left: string, right: string, width: number) {
  const gap = 1;
  const maxLeft = Math.max(1, width - right.length - gap);
  const a = clip(left, maxLeft);
  const spaces = Math.max(gap, width - a.length - right.length);
  return `${a}${" ".repeat(spaces)}${right}`;
}
function wrap(value: string, width: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current.length <= width ? current : clip(current, width));
    current = word;
  }
  if (current) lines.push(current.length <= width ? current : clip(current, width));
  return lines;
}
function labeled(lines: string[], label: string, value: string | null | undefined, width: number) {
  const clean = String(value ?? "").trim();
  if (!clean) return;
  lines.push(...wrap(`${label}: ${clean}`, width));
}
function normalize(value: string | null | undefined) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function isFlavorGroup(group: string | null | undefined) {
  return normalize(group).includes("sabor");
}
function aggregateModifiers(modifiers: PrintModifier[]) {
  const map = new Map<string, PrintModifier>();
  for (const modifier of modifiers) {
    const key = `${modifier.group ?? ""}\u0000${modifier.name}`;
    const current = map.get(key);
    if (current) {
      map.set(key, { ...current, quantity: current.quantity + modifier.quantity });
    } else {
      map.set(key, { ...modifier });
    }
  }
  return [...map.values()];
}
function printModifiers(lines: string[], modifiers: PrintModifier[], width: number) {
  const aggregated = aggregateModifiers(modifiers);
  const flavors = aggregated.filter((modifier) => isFlavorGroup(modifier.group));
  const others = aggregated.filter((modifier) => !isFlavorGroup(modifier.group));

  if (flavors.length > 0) {
    lines.push(clip("  SABORES PARA FRITAR:", width));
    for (const flavor of flavors) {
      lines.push(...wrap(`    ${flavor.quantity}x ${flavor.name}`, width));
    }
    const total = flavors.reduce((sum, flavor) => sum + flavor.quantity, 0);
    lines.push(clip(`  TOTAL PARA FRITAR: ${total}`, width));
  }

  for (const modifier of others) {
    lines.push(...wrap(`  + ${modifier.quantity > 1 ? `${modifier.quantity}x ` : ""}${modifier.name}`, width));
  }
}
function orderTime(payload: PrintPayload) {
  const date = new Date(payload.order.confirmed_at ?? payload.order.created_at);
  try {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: payload.order.timezone ?? "America/Sao_Paulo" }).format(date);
  } catch { return date.toISOString().slice(11, 16); }
}
function scheduledTime(payload: PrintPayload) {
  if (!payload.order.scheduled_for) return null;
  const date = new Date(payload.order.scheduled_for);
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: payload.order.timezone ?? "America/Sao_Paulo" }).format(date);
  } catch { return date.toISOString().slice(0, 16).replace("T", " "); }
}
function items(lines: string[], payload: PrintPayload, width: number, showPrice: boolean, preferences: OrderPrintPreferences) {
  for (const item of payload.items) {
    const left = `${item.quantity}x ${item.name}`;
    lines.push(showPrice && preferences.show_prices && item.line_total_cents !== undefined ? pair(left, money(item.line_total_cents), width) : clip(left, width));
    if (preferences.show_item_modifiers) printModifiers(lines, item.modifiers, width);
    if (preferences.show_item_notes && item.note) lines.push(...wrap(`  OBS: ${item.note}`, width));
  }
}
function deliveryBlock(lines: string[], payload: PrintPayload, width: number, preferences: OrderPrintPreferences) {
  if (payload.order.fulfillment_type !== "delivery") return;
  const address = payload.order.address;
  const hasCustomer = preferences.show_customer_name && Boolean(payload.order.customer_name);
  const hasPhone = preferences.show_customer_phone && Boolean(payload.order.customer_phone);
  const hasAddress = preferences.show_delivery_address && Boolean(address);
  if (!hasCustomer && !hasPhone && !hasAddress) return;

  lines.push(line("=", width));
  lines.push(center("DADOS PARA ENTREGA", width));
  lines.push(line("=", width));
  if (preferences.show_customer_name) labeled(lines, "CLIENTE", payload.order.customer_name, width);
  if (preferences.show_customer_phone) labeled(lines, "TELEFONE", payload.order.customer_phone, width);
  if (preferences.show_delivery_address && address) {
    const streetAndNumber = [address.street, address.number ? `Nº ${address.number}` : null].filter(Boolean).join(", ");
    labeled(lines, "ENDERECO", streetAndNumber, width);
    labeled(lines, "BAIRRO", address.district, width);
    labeled(lines, "COMPLEMENTO", address.complement, width);
    labeled(lines, "REFERENCIA", address.reference, width);
    const cityState = [address.city, address.state].filter(Boolean).join("/");
    labeled(lines, "CIDADE/UF", cityState, width);
  }
  lines.push(line("=", width));
}

export function renderPrintDocument(
  input: unknown,
  documentType: PrintDocumentType,
  paperWidthMm: number,
  reprint = false,
  preferencesInput: unknown = DEFAULT_ORDER_PRINT_PREFERENCES,
) {
  const payload = printPayloadSchema.parse(input);
  const preferences = resolveOrderPrintPreferences(preferencesInput);
  const width = paperWidthMm === 58 ? 32 : 48;
  const out: string[] = [];
  if (reprint) { out.push(center("*** REIMPRESSAO ***", width)); out.push(line("*", width)); }
  out.push(center(`PEDIDO #${payload.order.display_number}`, width));
  out.push(center(payload.station.name.toUpperCase(), width));
  out.push(pair(orderTime(payload), payload.order.channel.toUpperCase(), width));
  const requestedTime = scheduledTime(payload);
  if (requestedTime) out.push(clip(`AGENDADO: ${requestedTime}`, width));
  out.push(line("-", width));

  if (documentType === "kitchen") {
    // Cozinha continua sem preços, independentemente da preferência do comprovante.
    items(out, payload, width, false, preferences);
  } else {
    if (payload.order.fulfillment_type === "delivery") {
      deliveryBlock(out, payload, width, preferences);
    } else if (preferences.show_customer_name && payload.order.customer_name) {
      out.push(clip(`Cliente: ${payload.order.customer_name}`, width));
    }
    out.push(line("-", width));
    items(out, payload, width, true, preferences);
    if (preferences.show_prices) {
      out.push(line("-", width));
      out.push(pair("Subtotal", money(payload.order.subtotal_cents), width));
      if (payload.order.discount_cents > 0) out.push(pair("Desconto", `-${money(payload.order.discount_cents)}`, width));
      if (payload.order.delivery_fee_cents > 0) out.push(pair("Entrega", money(payload.order.delivery_fee_cents), width));
      out.push(pair("TOTAL", money(payload.order.total_cents), width));
    }
    if (preferences.show_payment && payload.order.payment_method) {
      out.push(clip(`Pagamento: ${payload.order.payment_method}`, width));
      if (preferences.show_prices && payload.order.payment_method === "cash" && (payload.order.cash_change_for_cents ?? 0) > 0) {
        const cashChangeForCents = payload.order.cash_change_for_cents ?? 0;
        out.push(pair("Troco para", money(cashChangeForCents), width));
        out.push(pair("Troco", money(Math.max(0, cashChangeForCents - payload.order.total_cents)), width));
      }
    }
  }
  if (preferences.show_footer && preferences.footer_text) {
    out.push(line("-", width));
    out.push(...wrap(preferences.footer_text, width).map((value) => center(value, width)));
  }
  out.push(line("-", width));
  out.push(center("PedeAqui", width));
  return `${out.join("\n")}\n`;
}
