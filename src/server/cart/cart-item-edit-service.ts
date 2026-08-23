import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AddCartItemInput, GasSaleMode } from "@/server/cart/schemas";
import { hashCartToken } from "@/server/cart/cart-token";
import { PublicMenuService } from "@/server/menu/public-menu-service";
import { PricingError, PricingService, type PricingProduct } from "@/server/pricing/pricing-service";

const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function pricingProductFromPublic(state: NonNullable<Awaited<ReturnType<typeof PublicMenuService.getProduct>>>): PricingProduct {
  const product = state.product;
  return {
    id: product.id,
    name: product.name,
    imageUrl: product.image_url,
    priceCents: product.price_cents,
    promotionalPriceCents: product.promotional_price_cents,
    available: product.availability === "available",
    modifierGroups: product.modifier_groups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelection: group.min_selection,
      maxSelection: group.max_selection,
      required: group.required,
      selectionMode: group.selection_mode,
      modifiers: group.modifiers.map((modifier) => ({
        id: modifier.id,
        groupId: group.id,
        groupName: group.name,
        name: modifier.name,
        priceCents: modifier.price_cents,
      })),
    })),
  };
}

function assertGasMode(state: NonNullable<Awaited<ReturnType<typeof PublicMenuService.getProduct>>>, saleMode?: GasSaleMode | null) {
  const gas = state.gas;
  if (saleMode && !gas) throw new PricingError("invalid_modifiers", "Opção de vasilhame indisponível");
  if (gas?.requireContainerChoice && !saleMode) throw new PricingError("invalid_modifiers", "Escolha troca de vasilhame ou produto com casco");
  if (saleMode === "exchange" && !gas?.exchangeEnabled) throw new PricingError("invalid_modifiers", "Troca de vasilhame indisponível");
  if (saleMode === "with_container" && !gas?.containerSaleEnabled) throw new PricingError("invalid_modifiers", "Venda com casco indisponível");
}

export class CartItemEditService {
  static async replaceItem(values: AddCartItemInput, token: string, existingItemId: string) {
    const state = await PublicMenuService.getProduct(values.storeSlug, values.productId);
    if (!state || state.product.availability !== "available") throw new PricingError("product_unavailable", "Produto indisponível");
    if (!state.operational.canOrder) throw new PricingError("store_unavailable", "A loja não está aceitando pedidos agora");

    assertGasMode(state, values.gasSaleMode);
    const selectedModifiers = values.modifierSelections.length > 0 ? values.modifierSelections : values.modifierIds;
    const priced = PricingService.priceItem(pricingProductFromPublic(state), selectedModifiers, values.quantity);

    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin
      .from("stores")
      .select("id, organization_id, slug")
      .eq("id", state.store.id)
      .ilike("slug", values.storeSlug)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) throw new PricingError("store_unavailable", "Loja indisponível");

    const { data, error } = await admin.rpc("cart_replace_item_internal", {
      p_organization_id: store.organization_id,
      p_store_id: store.id,
      p_token_hash: hashCartToken(token),
      p_existing_item_id: existingItemId,
      p_expires_at: new Date(Date.now() + CART_TTL_MS).toISOString(),
      p_product_id: state.product.id,
      p_product_name: state.product.name,
      p_product_image_url: state.product.image_url,
      p_unit_base_price_cents: priced.baseUnitPriceCents,
      p_quantity: values.quantity,
      p_note: values.note ?? "",
      p_modifiers: priced.modifiers,
      p_sale_mode: values.gasSaleMode ?? null,
    });
    if (error) throw error;

    return { store, data };
  }
}
