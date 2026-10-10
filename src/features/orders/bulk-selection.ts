export const BULK_SELECTION_LIMIT = 50;

/** Build one bounded batch from the orders currently shown by the filter. */
export function selectBulkOrders(eligibleIds: readonly string[]) {
  return new Set([...new Set(eligibleIds)].slice(0, BULK_SELECTION_LIMIT));
}

export function toggleBulkOrder(current: ReadonlySet<string>, eligibleIds: readonly string[], orderId: string, selected: boolean) {
  const eligible = new Set(eligibleIds);
  const next = selectBulkOrders([...current].filter((id) => eligible.has(id)));
  if (!selected) next.delete(orderId);
  else if (eligible.has(orderId) && next.size < BULK_SELECTION_LIMIT) next.add(orderId);
  return next;
}
