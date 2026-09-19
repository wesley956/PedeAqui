import { createAdminClient } from "@/lib/supabase/admin";
import { IntelligenceCatalogAdapter, type CatalogProductDetails } from "@/server/intelligence/catalog-adapter";
import { createIntelligenceContext } from "@/server/intelligence/context";
import { PublicMenuService } from "@/server/menu/public-menu-service";

export type WhatsAppCatalogCandidate = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  promotional_price_cents: number | null;
};

export type WhatsAppCompositionProfile = {
  productId: string;
  name: string;
  quantity: number;
  groupId: string;
  groupName: string;
  distributionTotal: number;
  required: boolean;
  minSelection: number;
  maxSelection: number;
  modifiers: Array<{ id: string; name: string; priceCents: number }>;
};

async function createCatalog(input: { organizationId: string; storeId: string; storeSlug: string }) {
  const admin = createAdminClient();
  const { data: store, error } = await admin.from("stores")
    .select("business_type")
    .eq("organization_id", input.organizationId)
    .eq("id", input.storeId)
    .maybeSingle();
  if (error) throw error;
  if (!store) return null;

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
  return new IntelligenceCatalogAdapter(intelligenceContext, input.storeSlug);
}

function toCandidate(item: Awaited<ReturnType<IntelligenceCatalogAdapter["search"]>>[number]): WhatsAppCatalogCandidate {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price_cents: item.regularPriceCents,
    promotional_price_cents: item.effectivePriceCents < item.regularPriceCents ? item.effectivePriceCents : null,
  };
}

export async function loadWhatsAppCatalogCandidates(input: {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  query: string;
}): Promise<WhatsAppCatalogCandidate[]> {
  const catalog = await createCatalog(input);
  if (!catalog) return [];

  const [matched, fallback] = await Promise.all([
    catalog.search(input.query, { limit: 50 }),
    catalog.list({ limit: 50 }),
  ]);

  const byId = new Map<string, (typeof matched)[number]>();
  for (const item of [...matched, ...fallback]) byId.set(item.id, item);
  return [...byId.values()].map(toCandidate);
}

export async function loadWhatsAppProductDetails(input: {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  productId: string;
}): Promise<CatalogProductDetails | null> {
  const catalog = await createCatalog(input);
  if (!catalog) return null;
  return catalog.productDetails(input.productId);
}

function compositionProfile(details: CatalogProductDetails): WhatsAppCompositionProfile | null {
  const group = details.modifierGroups.find((candidate) =>
    candidate.selectionMode === "equal_split_options"
      && Number.isInteger(candidate.distributionTotal)
      && Number(candidate.distributionTotal) > 0,
  );
  if (!group?.distributionTotal) return null;
  return {
    productId: details.id,
    name: details.name,
    quantity: 1,
    groupId: group.id,
    groupName: group.name,
    distributionTotal: group.distributionTotal,
    required: group.required,
    minSelection: group.minSelection,
    maxSelection: group.maxSelection,
    modifiers: group.modifiers,
  };
}

export async function loadWhatsAppCompositionProfile(input: {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  productId: string;
}): Promise<WhatsAppCompositionProfile | null> {
  const details = await loadWhatsAppProductDetails(input);
  if (!details || details.availability !== "available") return null;
  return compositionProfile(details);
}

export async function findWhatsAppCompositionProfiles(input: {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  distributionTotal: number;
}): Promise<WhatsAppCompositionProfile[]> {
  const catalog = await createCatalog(input);
  if (!catalog) return [];

  const menu = await PublicMenuService.getMenu(input.storeSlug);
  if (!menu || menu.store.id !== input.storeId) return [];

  const productIds = new Set<string>();
  for (const category of menu.categories) {
    for (const product of category.products) {
      if (product.availability === "available") productIds.add(product.id);
    }
  }

  const profiles = await Promise.all([...productIds].map(async (productId) => {
    const details = await catalog.productDetails(productId);
    if (!details || details.availability !== "available") return null;
    const profile = compositionProfile(details);
    return profile?.distributionTotal === input.distributionTotal ? profile : null;
  }));
  return profiles.filter((profile): profile is WhatsAppCompositionProfile => Boolean(profile));
}
