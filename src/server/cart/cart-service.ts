import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createCartToken, hashCartToken } from "@/server/cart/cart-token";
import { addCartItemSchema, type AddCartItemInput, type GasSaleMode } from "@/server/cart/schemas";
import { PricingError, PricingService, type PricingProduct } from "@/server/pricing/pricing-service";
import { isOpenAt } from "@/server/menu/schedule";

const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;
type StoreRef = { id: string; organization_id: string; slug: string; name: string; business_type: string; status: string; timezone: string; accepting_orders: boolean };
type GasSaleContext = { exchange_enabled: boolean; container_sale_enabled: boolean; require_container_choice: boolean; container_surcharge_cents: number };

export type CartPriceChange = { itemId: string; productName: string; kind: "price_changed" | "unavailable" | "invalid_modifiers" };

export class CartService {
  private static async resolveStore(admin: AdminClient, slug: string): Promise<StoreRef> {
    const { data: store, error } = await admin.from("stores")
      .select("id, organization_id, slug, name, status, business_type, timezone")
      .ilike("slug", slug).in("status", ["active", "temporarily_closed"]).maybeSingle();
    if (error) throw error;
    if (!store) throw new Error("Store not found");
    const { data: settings, error: settingsError } = await admin.from("store_menu_settings").select("active, accepting_orders").eq("store_id", store.id).maybeSingle();
    if (settingsError) throw settingsError;
    if (settings && settings.active === false) throw new Error("Menu is unavailable");
    return { id: store.id, organization_id: store.organization_id, slug: store.slug, name: store.name, business_type: store.business_type ?? "restaurant", status: store.status, timezone: store.timezone, accepting_orders: settings?.accepting_orders ?? true };
  }

  private static async assertAcceptingOrders(admin: AdminClient, store: StoreRef) {
    if (store.status !== "active" || !store.accepting_orders) {
      throw new PricingError("store_unavailable", "A loja não está aceitando pedidos agora");
    }
    const { data: hours, error } = await admin.from("store_hours")
      .select("weekday, opens_at, closes_at, closes_next_day")
      .eq("organization_id", store.organization_id).eq("store_id", store.id).eq("active", true);
    if (error) throw error;
    const schedule = (hours ?? []).map((period) => ({
      weekday: period.weekday,
      opens_at: String(period.opens_at).slice(0, 5),
      closes_at: String(period.closes_at).slice(0, 5),
      closes_next_day: period.closes_next_day,
    }));
    if (!isOpenAt(schedule, store.timezone)) {
      throw new PricingError("store_unavailable", "A loja está fora do horário de atendimento");
    }
  }

  private static async loadGasSaleContext(admin: AdminClient, store: StoreRef, productId: string): Promise<GasSaleContext | null> {
    if (store.business_type !== "gas") return null;
    const [{ data: moduleRow, error: moduleError }, { data: entitlement, error: entitlementError }] = await Promise.all([
      admin.from("store_modules").select("enabled").eq("organization_id", store.organization_id).eq("store_id", store.id).eq("module_key", "gas_containers").maybeSingle(),
      admin.rpc("organization_entitlement_internal", { p_organization_id: store.organization_id, p_feature_key: "module.gas_containers" }),
    ]);
    if (moduleError) throw moduleError;
    if (entitlementError) throw entitlementError;
    if (!moduleRow?.enabled || !(entitlement as { enabled?: boolean } | null)?.enabled) return null;
    const { data: profile, error } = await admin.from("product_gas_profiles")
      .select("exchange_enabled, container_sale_enabled, require_container_choice, container_surcharge_cents, active")
      .eq("organization_id", store.organization_id).eq("store_id", store.id).eq("product_id", productId).maybeSingle();
    if (error) throw error;
    if (!profile?.active) return null;
    return {
      exchange_enabled: Boolean(profile.exchange_enabled),
      container_sale_enabled: Boolean(profile.container_sale_enabled),
      require_container_choice: Boolean(profile.require_container_choice),
      container_surcharge_cents: Number(profile.container_surcharge_cents ?? 0),
    };
  }

  private static assertGasSaleMode(context: GasSaleContext | null, saleMode: GasSaleMode | null | undefined) {
    if (saleMode && !context) throw new PricingError("invalid_modifiers", "Opção de vasilhame indisponível");
    if (context?.require_container_choice && !saleMode) throw new PricingError("invalid_modifiers", "Escolha troca de vasilhame ou produto com casco");
    if (saleMode === "exchange" && !context?.exchange_enabled) throw new PricingError("invalid_modifiers", "Troca de vasilhame indisponível");
    if (saleMode === "with_container" && !context?.container_sale_enabled) throw new PricingError("invalid_modifiers", "Venda com casco indisponível");
  }

  private static async loadPricingProduct(admin: AdminClient, store: StoreRef, productId: string): Promise<PricingProduct | null> {
    const { data: product, error } = await admin.from("products")
      .select("id, name, image_url, price_cents, promotional_price_cents, active, availability, deleted_at")
      .eq("id", productId).eq("organization_id", store.organization_id).eq("store_id", store.id).maybeSingle();
    if (error) throw error;
    if (!product || !product.active || product.deleted_at || product.availability !== "available") return null;
    const { data: links, error: linksError } = await admin.from("product_modifier_groups")
      .select("modifier_group_id, sort_order").eq("organization_id", store.organization_id).eq("store_id", store.id).eq("product_id", product.id).order("sort_order");
    if (linksError) throw linksError;
    const groupIds = (links ?? []).map((row) => row.modifier_group_id);
    if (groupIds.length === 0) return { id: product.id, name: product.name, imageUrl: product.image_url, priceCents: product.price_cents, promotionalPriceCents: product.promotional_price_cents, available: true, modifierGroups: [] };
    const [{ data: groups, error: groupsError }, { data: modifiers, error: modifiersError }] = await Promise.all([
      admin.from("modifier_groups").select("id, name, min_selection, max_selection, required, active, deleted_at").eq("organization_id", store.organization_id).eq("store_id", store.id).in("id", groupIds),
      admin.from("modifiers").select("id, modifier_group_id, name, price_cents, active, deleted_at, sort_order").eq("organization_id", store.organization_id).eq("store_id", store.id).in("modifier_group_id", groupIds).order("sort_order"),
    ]);
    if (groupsError) throw groupsError;
    if (modifiersError) throw modifiersError;
    const groupMap = new Map((groups ?? []).filter((group) => group.active && !group.deleted_at).map((group) => [group.id, group]));
    const orderedGroups = groupIds.map((groupId) => groupMap.get(groupId)).filter((group): group is NonNullable<typeof group> => Boolean(group)).map((group) => ({
      id: group.id, name: group.name, minSelection: group.min_selection, maxSelection: group.max_selection, required: group.required,
      modifiers: (modifiers ?? []).filter((modifier) => modifier.modifier_group_id === group.id && modifier.active && !modifier.deleted_at).map((modifier) => ({ id: modifier.id, groupId: group.id, groupName: group.name, name: modifier.name, priceCents: modifier.price_cents })),
    }));
    return { id: product.id, name: product.name, imageUrl: product.image_url, priceCents: product.price_cents, promotionalPriceCents: product.promotional_price_cents, available: true, modifierGroups: orderedGroups };
  }

  static async addItem(input: AddCartItemInput, existingToken?: string | null) {
    const values = addCartItemSchema.parse(input);
    const admin = createAdminClient();
    const store = await this.resolveStore(admin, values.storeSlug);
    const [, product] = await Promise.all([
      this.assertAcceptingOrders(admin, store),
      this.loadPricingProduct(admin, store, values.productId),
    ]);
    if (!product) throw new PricingError("product_unavailable", "Produto indisponível");
    const gasContext = await this.loadGasSaleContext(admin, store, product.id);
    this.assertGasSaleMode(gasContext, values.gasSaleMode);
    const priced = PricingService.priceItem(product, values.modifierIds, values.quantity);
    const token = existingToken || createCartToken();
    const tokenHash = hashCartToken(token);
    const expiresAt = new Date(Date.now() + CART_TTL_MS).toISOString();
    const commonArgs = {
      p_organization_id: store.organization_id, p_store_id: store.id, p_token_hash: tokenHash, p_expires_at: expiresAt,
      p_product_id: product.id, p_product_name: product.name, p_product_image_url: product.imageUrl,
      p_unit_base_price_cents: priced.baseUnitPriceCents, p_quantity: values.quantity, p_note: values.note ?? "", p_modifiers: priced.modifiers,
    };
    const { data, error } = values.gasSaleMode
      ? await admin.rpc("cart_add_gas_item_internal", { ...commonArgs, p_sale_mode: values.gasSaleMode })
      : await admin.rpc("cart_add_item_internal", commonArgs);
    if (error) throw error;
    return { token, store, data };
  }

  private static async fetchCart(admin: AdminClient, store: StoreRef, tokenHash: string) {
    const { data: cart, error } = await admin.from("carts")
      .select("id, customer_id, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, expires_at, updated_at, coupon_id, coupon_code_snapshot, coupon_discount_cents, cashback_redeem_requested_cents, cashback_discount_cents, loyalty_redeem_requested_points, loyalty_discount_cents")
      .eq("organization_id", store.organization_id).eq("store_id", store.id).eq("token_hash", tokenHash).eq("status", "active").gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!cart) return null;
    const { data: items, error: itemsError } = await admin.from("cart_items")
      .select("id, product_id, product_name_snapshot, product_image_url_snapshot, quantity, note, unit_base_price_cents, unit_modifiers_price_cents, unit_segment_price_cents, unit_total_price_cents, line_total_cents, validation_status, price_changed_at, created_at")
      .eq("cart_id", cart.id).order("created_at");
    if (itemsError) throw itemsError;
    const itemIds = (items ?? []).map((item) => item.id);
    const [modifiersResult, gasResult] = itemIds.length > 0 ? await Promise.all([
      admin.from("cart_item_modifiers").select("cart_item_id, modifier_group_id, modifier_id, group_name_snapshot, modifier_name_snapshot, unit_price_cents").in("cart_item_id", itemIds).order("created_at"),
      admin.from("cart_item_gas_options").select("cart_item_id, sale_mode, container_code_snapshot, container_name_snapshot, unit_container_price_cents").in("cart_item_id", itemIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (modifiersResult.error) throw modifiersResult.error;
    if (gasResult.error) throw gasResult.error;
    return { ...cart, items: (items ?? []).map((item) => ({ ...item, modifiers: (modifiersResult.data ?? []).filter((modifier) => modifier.cart_item_id === item.id), gas: (gasResult.data ?? []).find((option) => option.cart_item_id === item.id) ?? null })) };
  }

  static async getCart(storeSlug: string, token?: string | null) {
    if (!token) return { cart: null, changes: [] as CartPriceChange[] };
    const admin = createAdminClient();
    const store = await this.resolveStore(admin, storeSlug);
    const tokenHash = hashCartToken(token);
    const cart = await this.fetchCart(admin, store, tokenHash);
    if (!cart) return { cart: null, changes: [] as CartPriceChange[] };
    const changes: CartPriceChange[] = [];
    const updates: Array<Record<string, unknown>> = [];
    const productCache = new Map<string, PricingProduct | null>();
    const gasContextCache = new Map<string, GasSaleContext | null>();

    for (const item of cart.items) {
      let product = productCache.get(item.product_id);
      if (product === undefined) { product = await this.loadPricingProduct(admin, store, item.product_id); productCache.set(item.product_id, product); }
      if (!product) {
        updates.push({ item_id: item.id, validation_status: "unavailable" });
        if (item.validation_status !== "unavailable") changes.push({ itemId: item.id, productName: item.product_name_snapshot, kind: "unavailable" });
        continue;
      }
      try {
        const selectedIds = item.modifiers.map((modifier) => modifier.modifier_id);
        const priced = PricingService.priceItem(product, selectedIds, item.quantity);
        let segmentUnitPrice = 0;
        if (item.gas) {
          let gasContext = gasContextCache.get(item.product_id);
          if (gasContext === undefined) { gasContext = await this.loadGasSaleContext(admin, store, item.product_id); gasContextCache.set(item.product_id, gasContext); }
          this.assertGasSaleMode(gasContext, item.gas.sale_mode as GasSaleMode);
          segmentUnitPrice = item.gas.sale_mode === "with_container" ? gasContext!.container_surcharge_cents : 0;
        }
        const unitTotalPriceCents = priced.unitTotalPriceCents + segmentUnitPrice;
        const lineTotalCents = unitTotalPriceCents * item.quantity;
        const priceChanged = item.unit_base_price_cents !== priced.baseUnitPriceCents || item.unit_modifiers_price_cents !== priced.modifiersUnitPriceCents
          || Number(item.unit_segment_price_cents ?? 0) !== segmentUnitPrice || item.unit_total_price_cents !== unitTotalPriceCents || Number(item.line_total_cents) !== lineTotalCents;
        const snapshotChanged = item.product_name_snapshot !== product.name || item.product_image_url_snapshot !== product.imageUrl;
        updates.push({ item_id: item.id, validation_status: "valid", product_name: product.name, product_image_url: product.imageUrl ?? "", unit_base_price_cents: priced.baseUnitPriceCents,
          unit_modifiers_price_cents: priced.modifiersUnitPriceCents, unit_segment_price_cents: segmentUnitPrice, unit_total_price_cents: unitTotalPriceCents,
          line_total_cents: lineTotalCents, price_changed: priceChanged, modifiers: priced.modifiers });
        if (priceChanged) changes.push({ itemId: item.id, productName: product.name, kind: "price_changed" });
        else if (item.validation_status !== "valid" || snapshotChanged) { /* snapshots refreshed */ }
      } catch (error) {
        if (error instanceof PricingError && error.code === "invalid_modifiers") {
          updates.push({ item_id: item.id, validation_status: "invalid_modifiers" });
          if (item.validation_status !== "invalid_modifiers") changes.push({ itemId: item.id, productName: product.name, kind: "invalid_modifiers" });
          continue;
        }
        throw error;
      }
    }
    if (updates.length > 0) {
      const { error } = await admin.rpc("cart_apply_reprice_internal", { p_store_id: store.id, p_token_hash: tokenHash, p_updates: updates });
      if (error) throw error;
    }
    const { data: benefitRefresh, error: benefitError } = await admin.rpc("growth_refresh_cart_benefits_internal", { p_store_id: store.id, p_token_hash: tokenHash });
    if (benefitError) throw benefitError;
    return { cart: await this.fetchCart(admin, store, tokenHash), changes, store, benefitRefresh };
  }

  static async updateQuantity(storeSlug: string, token: string, itemId: string, quantity: number) {
    const admin = createAdminClient(); const store = await this.resolveStore(admin, storeSlug);
    const { error } = await admin.rpc("cart_update_quantity_internal", { p_store_id: store.id, p_token_hash: hashCartToken(token), p_item_id: itemId, p_quantity: quantity });
    if (error) throw error; return this.getCart(storeSlug, token);
  }

  static async removeItem(storeSlug: string, token: string, itemId: string) {
    const admin = createAdminClient(); const store = await this.resolveStore(admin, storeSlug);
    const { error } = await admin.rpc("cart_remove_item_internal", { p_store_id: store.id, p_token_hash: hashCartToken(token), p_item_id: itemId });
    if (error) throw error; return this.getCart(storeSlug, token);
  }
}
