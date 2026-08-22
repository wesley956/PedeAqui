import { z } from "zod";

const modifierSchema = z.object({ group: z.string().nullable().optional(), name: z.string(), unit_price_cents: z.number().optional() });
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

export type PrintPayload = z.infer<typeof printPayloadSchema>;
export type PrintDocumentType = "kitchen" | "expedition" | "counter" | "receipt" | "custom";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
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
function items(lines: string[], payload: PrintPayload, width: number, showPrice: boolean) {
  for (const item of payload.items) {
    const left = `${item.quantity}x ${item.name}`;
    lines.push(showPrice && item.line_total_cents !== undefined ? pair(left, money(item.line_total_cents), width) : clip(left, width));
    for (const modifier of item.modifiers) lines.push(clip(`  + ${modifier.name}`, width));
    if (item.note) lines.push(clip(`  OBS: ${item.note}`, width));
  }
}

export function renderPrintDocument(input: unknown, documentType: PrintDocumentType, paperWidthMm: number, reprint = false) {
  const payload = printPayloadSchema.parse(input);
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
    items(out, payload, width, false);
  } else {
    if (payload.order.customer_name) out.push(clip(`Cliente: ${payload.order.customer_name}`, width));
    if (documentType === "expedition" && payload.order.fulfillment_type === "delivery" && payload.order.address) {
      const address = payload.order.address;
      out.push(clip(`${address.street ?? ""}, ${address.number ?? ""}${address.complement ? ` - ${address.complement}` : ""}`, width));
      out.push(clip(`${address.district ?? ""} - ${address.city ?? ""}/${address.state ?? ""}`, width));
      if (address.reference) out.push(clip(`Ref: ${address.reference}`, width));
    }
    out.push(line("-", width));
    items(out, payload, width, true);
    out.push(line("-", width));
    out.push(pair("Subtotal", money(payload.order.subtotal_cents), width));
    if (payload.order.discount_cents > 0) out.push(pair("Desconto", `-${money(payload.order.discount_cents)}`, width));
    if (payload.order.delivery_fee_cents > 0) out.push(pair("Entrega", money(payload.order.delivery_fee_cents), width));
    out.push(pair("TOTAL", money(payload.order.total_cents), width));
    if (payload.order.payment_method) out.push(clip(`Pagamento: ${payload.order.payment_method}`, width));
    if (payload.order.cash_change_for_cents) out.push(pair("Troco para", money(payload.order.cash_change_for_cents), width));
  }
  out.push(line("-", width));
  out.push(center("PedeAqui", width));
  return `${out.join("\n")}\n`;
}
