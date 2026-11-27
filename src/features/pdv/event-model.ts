// Pure domain rules for event inventory. Server-side atomic enforcement is still required.
export type EventStockLine = Readonly<{ productId: string; available: number }>;
export type EventQuantity = Readonly<{ productId: string; quantity: number }>;

export function projectEventStock(stock: readonly EventStockLine[], items: readonly EventQuantity[]): EventStockLine[] {
  const remaining = new Map<string, number>();
  for (const line of stock) {
    if (!line.productId || remaining.has(line.productId) || !Number.isSafeInteger(line.available) || line.available < 0) throw new Error("Estoque do evento inválido.");
    remaining.set(line.productId, line.available);
  }
  if (!items.length) throw new Error("Selecione pelo menos um produto.");
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new Error("Quantidade inválida.");
    const available = remaining.get(item.productId);
    if (available === undefined || item.quantity > available) throw new Error("Quantidade indisponível no evento.");
    remaining.set(item.productId, available - item.quantity);
  }
  return stock.map((line) => ({ productId: line.productId, available: remaining.get(line.productId)! }));
}

export type EventWindow = Readonly<{ startsAt: string; endsAt: string; storeOpen: boolean; closureReason?: string | null }>;
export function validateEventWindow(event: EventWindow) {
  const start = Date.parse(event.startsAt), end = Date.parse(event.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Período do evento inválido.");
  if (!event.storeOpen && !event.closureReason?.trim()) throw new Error("Informe o motivo do fechamento.");
  return { start, end };
}

export function eventTemporarilyClosesStore(event: EventWindow, now: number) {
  const { start, end } = validateEventWindow(event);
  return !event.storeOpen && now >= start && now < end;
}
