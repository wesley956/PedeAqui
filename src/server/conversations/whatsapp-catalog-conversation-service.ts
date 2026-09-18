import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGenericInformalPortuguese } from "@/server/conversations/generic-language-normalization";
import { createIntelligenceContext } from "@/server/intelligence/context";
import { IntelligenceCatalogAdapter } from "@/server/intelligence/catalog-adapter";

export type WhatsAppCatalogReadInput = {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  requestId?: string;
};

function normalize(value: string) {
  return normalizeGenericInformalPortuguese(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

async function catalog(input: WhatsAppCatalogReadInput) {
  const admin = createAdminClient();
  const { data: store, error } = await admin.from("stores")
    .select("id, organization_id, business_type")
    .eq("organization_id", input.organizationId)
    .eq("id", input.storeId)
    .maybeSingle();
  if (error) throw error;
  if (!store || store.organization_id !== input.organizationId) return null;

  const requestId = input.requestId ?? `wa-catalog:${input.storeId}`;
  const context = createIntelligenceContext({
    requestId,
    correlationId: requestId,
    organizationId: input.organizationId,
    storeId: input.storeId,
    channel: "whatsapp",
    businessType: store.business_type ?? "restaurant",
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: null, mode: "bot" },
    identity: { source: "anonymous", trust: "weak", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId: null },
    external: { provider: "meta_cloud", accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: false, revision: null },
  });
  return new IntelligenceCatalogAdapter(context, input.storeSlug);
}

export async function buildWhatsAppMenuSummary(input: WhatsAppCatalogReadInput, menuUrl: string) {
  const adapter = await catalog(input);
  if (!adapter) return `Não consegui abrir o cardápio desta loja com segurança agora. Você pode tentar pelo link oficial: ${menuUrl}`;
  const items = await adapter.list({ limit: 30 });
  if (!items.length) return `O cardápio não tem itens disponíveis para venda neste momento. Confira aqui: ${menuUrl}`;

  const groups = new Map<string, typeof items>();
  for (const item of items) groups.set(item.categoryName, [...(groups.get(item.categoryName) ?? []), item]);
  const lines = [...groups.entries()].slice(0, 6).map(([category, categoryItems]) => {
    const products = categoryItems.slice(0, 4).map((item) => `${item.name} (${money(item.effectivePriceCents)})`).join(", ");
    return `• ${category}: ${products}`;
  });
  return `Claro 😊 Aqui vai um resumo do cardápio disponível agora:\n${lines.join("\n")}\n\nOs preços e a disponibilidade acima vieram do cardápio atual da loja. Para ver todos os detalhes: ${menuUrl}`;
}

export async function buildWhatsAppCatalogAvailability(input: WhatsAppCatalogReadInput, query: string, menuUrl: string) {
  const adapter = await catalog(input);
  if (!adapter) return `Não consegui consultar “${query}” com segurança agora. Confira o cardápio oficial: ${menuUrl}`;
  const items = await adapter.search(query, { limit: 5 });
  if (!items.length) return `Não encontrei item disponível correspondente a “${query}” no cardápio atual. Confira as opções oficiais: ${menuUrl}`;
  const lines = items.map((item) => `• ${item.name} — ${money(item.effectivePriceCents)}`);
  return `Sim 😊 Encontrei estas opções disponíveis para “${query}” no cardápio atual:\n${lines.join("\n")}\n\nPara abrir os detalhes: ${menuUrl}`;
}

export async function buildWhatsAppModifierPlacement(input: WhatsAppCatalogReadInput, query: string) {
  const admin = createAdminClient();
  const { data: modifiers, error: modifierError } = await admin.from("modifiers")
    .select("id, name, modifier_group_id")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("active", true)
    .is("deleted_at", null)
    .limit(250);
  if (modifierError) throw modifierError;

  const wanted = normalize(query);
  const matched = (modifiers ?? []).filter((modifier) => {
    const name = normalize(String(modifier.name ?? ""));
    return name === wanted || (wanted.length >= 5 && (name.includes(wanted) || wanted.includes(name)));
  });
  if (!matched.length) return null;

  const groupIds = [...new Set(matched.map((modifier) => modifier.modifier_group_id).filter(Boolean))];
  const { data: links, error: linkError } = await admin.from("product_modifier_groups")
    .select("product_id, modifier_group_id")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .in("modifier_group_id", groupIds);
  if (linkError) throw linkError;
  const productIds = [...new Set((links ?? []).map((link) => link.product_id).filter(Boolean))];
  if (!productIds.length) return null;

  const { data: products, error: productError } = await admin.from("products")
    .select("id, name")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .in("id", productIds)
    .eq("active", true)
    .eq("availability", "available")
    .is("deleted_at", null)
    .order("name");
  if (productError) throw productError;
  if (!products?.length) return null;

  const flavor = matched[0]?.name ?? query;
  const names = products.slice(0, 5).map((product) => product.name);
  return `Encontrei “${flavor}” como opção/sabor dentro de ${names.length === 1 ? names[0] : names.join(", ")}. Para não trocar esse sabor por outro produto, escolha primeiro a caixa/pacote e depois informe a composição. Quando a caixa estiver em montagem, eu mantenho essa escolha dentro dela.`;
}
