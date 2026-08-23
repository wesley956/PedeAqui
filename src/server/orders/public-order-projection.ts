export type PublicOrderModifierProjection = {
  order_item_id: string;
  modifier_name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
};

export function groupPublicOrderModifiers(rows: PublicOrderModifierProjection[]) {
  const grouped = new Map<string, PublicOrderModifierProjection[]>();
  for (const row of rows) {
    const current = grouped.get(row.order_item_id) ?? [];
    current.push(row);
    grouped.set(row.order_item_id, current);
  }
  return grouped;
}
