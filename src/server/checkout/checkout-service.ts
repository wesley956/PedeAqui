import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CartService } from "@/server/cart/cart-service";
import { hashCartToken } from "@/server/cart/cart-token";
import { normalizePhone } from "@/server/customers/phone";
import { CustomerRecognitionService } from "@/server/customers/recognition-service";
import { DeliveryQuoteService } from "@/server/delivery/delivery-quote-service";
import { PublicMenuService } from "@/server/menu/public-menu-service";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import {
  checkoutAddressSchema,
  checkoutIdentitySchema,
  checkoutPaymentSchema,
  fulfillmentTypeSchema,
  type CheckoutAddressInput,
  type CheckoutIdentityInput,
  type CheckoutPaymentInput,
  type FulfillmentType,
} from "@/server/checkout/schemas";
import { reviewCheckout } from "@/server/checkout/review";

type AdminClient = ReturnType<typeof createAdminClient>;

type StoreRef = { id: string; organization_id: string; slug: string; name: string };

export class CheckoutError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}

export class CheckoutService {
  private static async requireCart(storeSlug: string, token: string) {
    const result = await CartService.getCart(storeSlug, token);
    const cart = result.cart;
    const store = result.store;
    if (!cart || cart.items.length === 0 || !store) {
      throw new CheckoutError("cart_empty", "Seu carrinho está vazio");
    }
    return { cart, store, changes: result.changes };
  }

  private static async getSession(admin: AdminClient, cartId: string) {
    const { data, error } = await admin.from("checkout_sessions")
      .select("id, customer_id, customer_name, customer_phone, customer_phone_normalized, customer_email, fulfillment_type, address_postal_code, address_street, address_number, address_complement, address_district, address_city, address_state, address_reference, delivery_quote_status, delivery_fee_cents, delivery_estimated_min_minutes, delivery_estimated_max_minutes, payment_method, cash_change_for_cents, reviewed_at, updated_at")
      .eq("cart_id", cartId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private static async upsertSession(admin: AdminClient, store: StoreRef, cartId: string, patch: Record<string, unknown>) {
    const { data, error } = await admin.from("checkout_sessions").upsert({
      organization_id: store.organization_id,
      store_id: store.id,
      cart_id: cartId,
      ...patch,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cart_id" }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  static async load(storeSlug: string, token: string, recognitionToken: string | null = null) {
    const cartResult = await this.requireCart(storeSlug, token);
    const admin = createAdminClient();
    const [session, methods, menu, recognizedCustomer] = await Promise.all([
      this.getSession(admin, cartResult.cart.id),
      StorePaymentMethodService.listForStore(cartResult.store.organization_id, cartResult.store.id),
      PublicMenuService.getMenu(storeSlug),
      CustomerRecognitionService.resolve(
        cartResult.store.organization_id,
        cartResult.store.id,
        recognitionToken,
      ),
    ]);
    if (!menu) throw new CheckoutError("menu_unavailable", "Cardápio indisponível");
    return { ...cartResult, session, paymentMethods: methods, menu, recognizedCustomer };
  }

  static async saveIdentity(storeSlug: string, token: string, input: CheckoutIdentityInput) {
    const values = checkoutIdentitySchema.parse(input);
    const cartResult = await this.requireCart(storeSlug, token);
    const admin = createAdminClient();
    const phoneNormalized = normalizePhone(values.phone);
    if (!phoneNormalized) throw new CheckoutError("invalid_phone", "Telefone inválido");

    const { data: existing, error: customerError } = await admin.from("customers")
      .select("id")
      .eq("organization_id", cartResult.store.organization_id)
      .eq("phone_normalized", phoneNormalized)
      .is("deleted_at", null)
      .maybeSingle();
    if (customerError) throw customerError;

    await this.upsertSession(admin, cartResult.store, cartResult.cart.id, {
      customer_id: existing?.id ?? null,
      customer_name: values.name,
      customer_phone: values.phone,
      customer_phone_normalized: phoneNormalized,
      customer_email: values.email ?? null,
    });
    const { error: cartUpdateError } = await admin.from("carts")
      .update({ customer_id: existing?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", cartResult.cart.id)
      .eq("organization_id", cartResult.store.organization_id)
      .eq("store_id", cartResult.store.id);
    if (cartUpdateError) throw cartUpdateError;
  }

  static async saveFulfillment(storeSlug: string, token: string, fulfillment: FulfillmentType) {
    const type = fulfillmentTypeSchema.parse(fulfillment);
    const cartResult = await this.requireCart(storeSlug, token);
    const menu = await PublicMenuService.getMenu(storeSlug);
    if (!menu) throw new CheckoutError("menu_unavailable", "Cardápio indisponível");

    if (type === "pickup" && !menu.settings.allow_pickup) {
      throw new CheckoutError("pickup_disabled", "Retirada não está disponível");
    }
    if (type === "delivery" && (!menu.settings.allow_delivery || !menu.delivery.enabled)) {
      throw new CheckoutError("delivery_disabled", "Entrega não está disponível");
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("checkout_set_fulfillment_internal", {
      p_store_id: cartResult.store.id,
      p_token_hash: hashCartToken(token),
      p_fulfillment_type: type,
      p_address: null,
      p_delivery_quote_status: type === "delivery" ? "required" : "not_required",
      p_delivery_fee_cents: 0,
      p_estimated_min_minutes: null,
      p_estimated_max_minutes: null,
    });
    if (error) throw error;
  }

  private static quoteDelivery(admin: AdminClient, store: StoreRef, subtotalCents: number, address: CheckoutAddressInput) {
    return DeliveryQuoteService.quote({
      admin,
      organizationId: store.organization_id,
      storeId: store.id,
      subtotalCents,
      address: { district: address.district, city: address.city, state: address.state },
    });
  }

  static async saveAddress(storeSlug: string, token: string, input: CheckoutAddressInput) {
    const address = checkoutAddressSchema.parse(input);
    const cartResult = await this.requireCart(storeSlug, token);
    const admin = createAdminClient();
    const session = await this.getSession(admin, cartResult.cart.id);
    if (session?.fulfillment_type !== "delivery") {
      throw new CheckoutError("delivery_not_selected", "Selecione entrega antes de informar o endereço");
    }

    const quote = await this.quoteDelivery(admin, cartResult.store, Number(cartResult.cart.subtotal_cents), address);
    const quoteStatus = quote.serviceable ? "valid" : "unserviceable";
    const { error } = await admin.rpc("checkout_set_fulfillment_internal", {
      p_store_id: cartResult.store.id,
      p_token_hash: hashCartToken(token),
      p_fulfillment_type: "delivery",
      p_address: {
        postal_code: address.postalCode,
        street: address.street,
        number: address.number,
        complement: address.complement ?? "",
        district: address.district,
        city: address.city,
        state: address.state,
        reference: address.reference ?? "",
      },
      p_delivery_quote_status: quoteStatus,
      p_delivery_fee_cents: quote.serviceable ? quote.feeCents : 0,
      p_estimated_min_minutes: quote.serviceable ? quote.estimatedMinMinutes : null,
      p_estimated_max_minutes: quote.serviceable ? quote.estimatedMaxMinutes : null,
    });
    if (error) throw error;
    if (!quote.serviceable) {
      if (quote.reason === "minimum_order") {
        throw new CheckoutError("delivery_minimum", `Pedido mínimo para este bairro: R$ ${(quote.minimumOrderCents / 100).toFixed(2).replace(".", ",")}`);
      }
      if (quote.reason === "neighborhood_not_served") throw new CheckoutError("neighborhood_not_served", "Este bairro ainda não é atendido");
      throw new CheckoutError("delivery_disabled", "Entrega indisponível no momento");
    }
    return quote;
  }

  static async useRecognizedAddress(storeSlug: string, token: string, recognitionToken: string | null, addressIndex: number) {
    if (!Number.isInteger(addressIndex) || addressIndex < 0) {
      throw new CheckoutError("saved_address_invalid", "Endereço salvo inválido");
    }
    const cartResult = await this.requireCart(storeSlug, token);
    const admin = createAdminClient();
    const session = await this.getSession(admin, cartResult.cart.id);
    if (session?.fulfillment_type !== "delivery") {
      throw new CheckoutError("delivery_not_selected", "Selecione entrega antes de escolher o endereço");
    }
    if (!session.customer_id) {
      throw new CheckoutError("identity_required", "Confirme seu nome e WhatsApp antes de reutilizar um endereço");
    }

    const recognized = await CustomerRecognitionService.resolve(
      cartResult.store.organization_id,
      cartResult.store.id,
      recognitionToken,
    );
    if (!recognized || recognized.customerId !== session.customer_id) {
      throw new CheckoutError("recognition_required", "Por segurança, informe o endereço novamente neste dispositivo");
    }
    const saved = recognized.addresses[addressIndex];
    if (!saved) throw new CheckoutError("saved_address_invalid", "Endereço salvo não está mais disponível");

    return this.saveAddress(storeSlug, token, {
      postalCode: saved.postalCode,
      street: saved.street,
      number: saved.number,
      complement: saved.complement,
      district: saved.district,
      city: saved.city,
      state: saved.state,
      reference: saved.reference,
    });
  }

  static async savePayment(storeSlug: string, token: string, input: CheckoutPaymentInput) {
    const values = checkoutPaymentSchema.parse(input);
    const cartResult = await this.requireCart(storeSlug, token);
    const methods = await StorePaymentMethodService.listForStore(cartResult.store.organization_id, cartResult.store.id);
    if (!methods.some((item) => item.method === values.method && item.enabled)) {
      throw new CheckoutError("payment_unavailable", "Forma de pagamento indisponível");
    }
    const changeFor = values.method === "cash" ? (values.cashChangeForCents ?? null) : null;
    if (changeFor !== null && changeFor < Number(cartResult.cart.total_cents)) {
      throw new CheckoutError("invalid_change", "O valor para troco deve ser igual ou maior que o total");
    }
    const admin = createAdminClient();
    await this.upsertSession(admin, cartResult.store, cartResult.cart.id, {
      payment_method: values.method,
      cash_change_for_cents: changeFor,
    });
  }

  static async review(storeSlug: string, token: string, recognitionToken: string | null = null) {
    let loaded = await this.load(storeSlug, token, recognitionToken);
    const admin = createAdminClient();
    let session = loaded.session;

    if (session?.fulfillment_type === "delivery" && session.address_postal_code && session.address_street && session.address_number && session.address_district && session.address_city && session.address_state) {
      const address = checkoutAddressSchema.parse({
        postalCode: session.address_postal_code,
        street: session.address_street,
        number: session.address_number,
        complement: session.address_complement,
        district: session.address_district,
        city: session.address_city,
        state: session.address_state,
        reference: session.address_reference,
      });
      const quote = await this.quoteDelivery(admin, loaded.store, Number(loaded.cart.subtotal_cents), address);
      const quoteStatus = quote.serviceable ? "valid" : "unserviceable";
      const fee = quote.serviceable ? quote.feeCents : 0;
      if (session.delivery_quote_status !== quoteStatus || Number(session.delivery_fee_cents) !== fee) {
        const { error } = await admin.rpc("checkout_set_fulfillment_internal", {
          p_store_id: loaded.store.id,
          p_token_hash: hashCartToken(token),
          p_fulfillment_type: "delivery",
          p_address: {
            postal_code: address.postalCode, street: address.street, number: address.number,
            complement: address.complement ?? "", district: address.district, city: address.city,
            state: address.state, reference: address.reference ?? "",
          },
          p_delivery_quote_status: quoteStatus,
          p_delivery_fee_cents: fee,
          p_estimated_min_minutes: quote.serviceable ? quote.estimatedMinMinutes : null,
          p_estimated_max_minutes: quote.serviceable ? quote.estimatedMaxMinutes : null,
        });
        if (error) throw error;
        loaded = await this.load(storeSlug, token, recognitionToken);
        session = loaded.session;
      }
    }

    const enabledMethods = loaded.paymentMethods.filter((item) => item.enabled).map((item) => item.method);
    const result = reviewCheckout({
      cartItemStatuses: loaded.cart.items.map((item) => item.validation_status),
      subtotalCents: Number(loaded.cart.subtotal_cents),
      totalCents: Number(loaded.cart.total_cents),
      minimumOrderCents: loaded.menu.settings.minimum_order_cents,
      canOrder: loaded.menu.operational.canOrder,
      identityComplete: Boolean(session?.customer_name && session?.customer_phone_normalized),
      fulfillmentType: session?.fulfillment_type ?? null,
      deliveryQuoteStatus: session?.delivery_quote_status ?? "not_required",
      paymentMethod: session?.payment_method ?? null,
      enabledPaymentMethods: enabledMethods,
      cashChangeForCents: session?.cash_change_for_cents === null || session?.cash_change_for_cents === undefined ? null : Number(session.cash_change_for_cents),
    });

    if (result.ready && session) {
      const reviewedAt = new Date().toISOString();
      const { error } = await admin.from("checkout_sessions").update({ reviewed_at: reviewedAt, updated_at: reviewedAt })
        .eq("id", session.id).eq("cart_id", loaded.cart.id);
      if (error) throw error;
      session = { ...session, reviewed_at: reviewedAt };
    }

    return { ...loaded, session, review: result };
  }
}
