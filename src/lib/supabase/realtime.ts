const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RealtimeStoreScope = {
  storeId: string;
  filter: string;
};

export function realtimeStoreScope(storeId: string): RealtimeStoreScope | null {
  const normalized = storeId.trim();
  if (!UUID_PATTERN.test(normalized)) return null;
  return {
    storeId: normalized,
    filter: `store_id=eq.${normalized}`,
  };
}
