export type PublicOrderModifierProjection = {
  order_item_id: string;
  modifier_name_snapshot: string;
  unit_price_cents: number;
  quantity?: number;
};

export type ResolvedPublicOrderModifierProjection = Omit<PublicOrderModifierProjection, "quantity"> & {
  quantity: number;
};

export function groupPublicOrderModifiers(rows: PublicOrderModifierProjection[]) {
  const grouped = new Map<string, ResolvedPublicOrderModifierProjection[]>();
  for (const row of rows) {
    const current = grouped.get(row.order_item_id) ?? [];
    const quantity = Number.isInteger(row.quantity) && Number(row.quantity) > 0 ? Number(row.quantity) : 1;
    current.push({ ...row, quantity });
    grouped.set(row.order_item_id, current);
  }
  return grouped;
}
