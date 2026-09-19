import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { IntelligenceCatalogAdapter } from "@/server/intelligence/catalog-adapter";
import { createIntelligenceContext } from "@/server/intelligence/context";

export type WhatsAppCatalogCandidate = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  promotional_price_cents: number | null;
};

export async function loadWhatsAppCatalogCandidates(input: {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  query: string;
}): Promise<WhatsAppCatalogCandidate[]> {
  const admin = createAdminClient();
  const { data: store, error } = await admin.from("stores")
    .select("business_type")
    .eq("organization_id", input.organizationId)
    .eq("id", input.storeId)
    .maybeSingle();
  if (error) throw error;
  if (!store) return [];

  const intelligenceContext = createIntelligenceContext({
    requestId: "whatsapp-order-catalog",
    correlationId: `whatsapp-order-catalog:${input.storeId}`,
    organizationId: input.organizationId,
    storeId: input.storeId,
    channel: "whatsapp",
    businessType: store.business_type ?? "restaurant",
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: null, mode: "bot" },
    identity: { source: "anonymous", trust: "none", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId: null },
    external: { provider: "meta_cloud", accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: false, revision: null },
  });
  const catalog = new IntelligenceCatalogAdapter(intelligenceContext, input.storeSlug);

  const [matched, fallback] = await Promise.all([
    catalog.search(input.query, { limit: 50 }),
    catalog.list({ limit: 50 }),
  ]);

  const byId = new Map<string, (typeof matched)[number]>();
  for (const item of [...matched, ...fallback]) byId.set(item.id, item);

  return [...byId.values()].map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price_cents: item.regularPriceCents,
    promotional_price_cents: item.effectivePriceCents < item.regularPriceCents ? item.effectivePriceCents : null,
  }));
}
