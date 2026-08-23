import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { CartService } from "@/server/cart/cart-service";
import { hashCartToken } from "@/server/cart/cart-token";
import {
  automationInputSchema,
  campaignInputSchema,
  cartBenefitsSchema,
  couponInputSchema,
  growthSettingsSchema,
  segmentInputSchema,
  type AutomationInput,
  type CampaignInput,
  type CartBenefitsInput,
  type CouponInput,
  type GrowthSettingsInput,
  type SegmentInput,
} from "@/server/growth/schemas";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Crescimento.");
  return storeId;
}

function moneyNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) ? number : 0;
}

export class GrowthService {
  static async loadOverview() {
    const context = await authorize(PERMISSIONS.GROWTH_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const [settings, coupons, segments, campaigns, rules, cashback, loyalty, customers, runs] = await Promise.all([
      admin.from("store_growth_settings").select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("coupons").select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).order("created_at", { ascending: false }),
      admin.from("customer_segments").select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).order("created_at", { ascending: false }),
      admin.from("campaigns").select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).order("created_at", { ascending: false }),
      admin.from("automation_rules").select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).order("created_at", { ascending: false }),
      admin.from("cashback_accounts").select("customer_id, balance_cents, lifetime_earned_cents, lifetime_redeemed_cents").eq("organization_id", context.organizationId).eq("store_id", storeId).order("balance_cents", { ascending: false }).limit(100),
      admin.from("loyalty_accounts").select("customer_id, balance_points, lifetime_earned_points, lifetime_redeemed_points").eq("organization_id", context.organizationId).eq("store_id", storeId).order("balance_points", { ascending: false }).limit(100),
      admin.from("customers").select("id, name, phone, email, orders_count, total_spent_cents, last_order_at").eq("organization_id", context.organizationId).is("deleted_at", null).order("last_order_at", { ascending: false, nullsFirst: false }).limit(250),
      admin.from("automation_runs").select("id, rule_id, customer_id, order_id, status, result, error_message, started_at, completed_at").eq("organization_id", context.organizationId).eq("store_id", storeId).order("started_at", { ascending: false }).limit(30),
    ]);

    for (const result of [settings, coupons, segments, campaigns, rules, cashback, loyalty, customers, runs]) {
      if (result.error) throw result.error;
    }

    const customerMap = new Map((customers.data ?? []).map((customer) => [customer.id, customer]));
    const loyaltyMap = new Map((loyalty.data ?? []).map((account) => [account.customer_id, account]));
    const cashbackMap = new Map((cashback.data ?? []).map((account) => [account.customer_id, account]));
    const balances = [...new Set([...(cashback.data ?? []).map((row) => row.customer_id), ...(loyalty.data ?? []).map((row) => row.customer_id)])]
      .map((customerId) => {
        const customer = customerMap.get(customerId);
        const cash = cashbackMap.get(customerId);
        const points = loyaltyMap.get(customerId);
        return {
          customerId,
          name: customer?.name ?? "Cliente",
          phone: customer?.phone ?? null,
          cashbackBalanceCents: moneyNumber(cash?.balance_cents),
          loyaltyBalancePoints: moneyNumber(points?.balance_points),
        };
      })
      .toSorted((a, b) => b.cashbackBalanceCents - a.cashbackBalanceCents || b.loyaltyBalancePoints - a.loyaltyBalancePoints || a.name.localeCompare(b.name, "pt-BR"));

    return {
      settings: settings.data,
      coupons: coupons.data ?? [],
      segments: segments.data ?? [],
      campaigns: campaigns.data ?? [],
      automationRules: rules.data ?? [],
      automationRuns: runs.data ?? [],
      balances,
    };
  }

  static async saveSettings(input: GrowthSettingsInput) {
    const values = growthSettingsSchema.parse(input);
    const context = await authorize(PERMISSIONS.GROWTH_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const row = {
      organization_id: context.organizationId,
      store_id: storeId,
      cashback_enabled: values.cashbackEnabled,
      cashback_rate_bps: values.cashbackRateBps,
      cashback_min_order_cents: values.cashbackMinOrderCents,
      cashback_expiry_days: values.cashbackExpiryDays,
      loyalty_enabled: values.loyaltyEnabled,
      loyalty_spend_cents_per_point: values.loyaltySpendCentsPerPoint,
      loyalty_redeem_cents_per_point: values.loyaltyRedeemCentsPerPoint,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("store_growth_settings").upsert(row, { onConflict: "store_id" }).select("*").single();
    if (error) throw error;
    await AuditService.record(context, { action: "growth.settings_updated", entityType: "store_growth_settings", entityId: storeId, after: data });
    return data;
  }

  static async createCoupon(input: CouponInput) {
    const values = couponInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.GROWTH_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("coupons").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      code: values.code,
      name: values.name,
      discount_type: values.discountType,
      fixed_discount_cents: values.discountType === "fixed" ? values.fixedDiscountCents : null,
      percentage_bps: values.discountType === "percentage" ? values.percentageBps : null,
      max_discount_cents: values.maxDiscountCents,
      minimum_order_cents: values.minimumOrderCents,
      usage_limit_total: values.usageLimitTotal,
      usage_limit_per_customer: values.usageLimitPerCustomer,
      valid_until: values.validUntil,
      allowed_channels: ["digital_menu", "pdv", "counter", "waiter", "table_qr", "manual"],
      created_by: context.userId,
      updated_by: context.userId,
    }).select("*").single();
    if (error) throw error;
    await AuditService.record(context, { action: "growth.coupon_created", entityType: "coupon", entityId: data.id, after: data });
    return data;
  }

  static async createSegment(input: SegmentInput) {
    const values = segmentInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.GROWTH_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const rules: Record<string, number | boolean> = {};
    if (values.ordersCountMin !== undefined) rules.orders_count_min = values.ordersCountMin;
    if (values.totalSpentCentsMin !== undefined) rules.total_spent_cents_min = values.totalSpentCentsMin;
    if (values.averageTicketCentsMin !== undefined) rules.average_ticket_cents_min = values.averageTicketCentsMin;
    if (values.inactiveDaysMin !== undefined) rules.inactive_days_min = values.inactiveDaysMin;
    if (values.lastOrderDaysMax !== undefined) rules.last_order_days_max = values.lastOrderDaysMax;
    if (values.hasCashbackBalance) rules.has_cashback_balance = true;
    if (values.hasLoyaltyBalance) rules.has_loyalty_balance = true;
    const { data, error } = await admin.from("customer_segments").insert({
      organization_id: context.organizationId, store_id: storeId, name: values.name, description: values.description,
      rules, created_by: context.userId, updated_by: context.userId,
    }).select("*").single();
    if (error) throw error;
    await AuditService.record(context, { action: "growth.segment_created", entityType: "customer_segment", entityId: data.id, after: data });
    return data;
  }

  static async createCampaign(input: CampaignInput) {
    const values = campaignInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    if (values.channel === "whatsapp") {
      const { data: settings, error: settingsError } = await admin.from("store_operational_settings")
        .select("growth_campaigns_enabled").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
      if (settingsError) throw settingsError;
      if (!settings?.growth_campaigns_enabled) throw new Error("Campanhas oficiais estão desligadas para esta unidade.");
    }
    const { data, error } = await admin.from("campaigns").insert({
      organization_id: context.organizationId, store_id: storeId, segment_id: values.segmentId,
      name: values.name, objective: values.objective, channel: values.channel, content: values.content,
      template_name: values.templateName ?? null, template_language: values.templateLanguage,
      template_data: { body_parameters: values.includeCustomerNameParameter ? ["customer_name"] : [] },
      status: "draft", created_by: context.userId, updated_by: context.userId,
    }).select("*").single();
    if (error) throw error;
    await AuditService.record(context, { action: "growth.campaign_created", entityType: "campaign", entityId: data.id, after: data });
    return data;
  }

  static async createAutomation(input: AutomationInput) {
    const values = automationInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const conditions: Record<string, number | string> = {};
    if (values.minimumTotalCents !== undefined) conditions.minimum_total_cents = values.minimumTotalCents;
    if (values.channel) conditions.channel = values.channel;
    if (values.inactiveDays !== undefined) conditions.inactive_days = values.inactiveDays;
    const actionConfig: Record<string, number | string> = {};
    if (values.campaignId) actionConfig.campaign_id = values.campaignId;
    if (values.bonusCashbackCents !== undefined) actionConfig.amount_cents = values.bonusCashbackCents;
    if (values.bonusPoints !== undefined) actionConfig.points = values.bonusPoints;
    const { data, error } = await admin.from("automation_rules").insert({
      organization_id: context.organizationId, store_id: storeId, name: values.name,
      trigger_type: values.triggerType, conditions, action_type: values.actionType, action_config: actionConfig,
      active: true, created_by: context.userId, updated_by: context.userId,
    }).select("*").single();
    if (error) throw error;
    await AuditService.record(context, { action: "growth.automation_created", entityType: "automation_rule", entityId: data.id, after: data });
    return data;
  }

  static async prepareCampaign(campaignId: string) {
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: campaign, error: campaignError } = await admin.from("campaigns").select("id").eq("id", campaignId)
      .eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) throw new Error("Campanha não encontrada nesta unidade.");
    const { data, error } = await admin.rpc("growth_prepare_campaign_internal", { p_campaign_id: campaignId, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async loadCampaignCenter() {
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const [settings, campaigns, segments, customers, customerOrders, preferences, recipients, whatsapp] = await Promise.all([
      admin.from("store_operational_settings").select("growth_campaigns_enabled,campaign_rate_per_minute").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("campaigns").select("id,name,objective,channel,content,template_name,template_language,status,audience_summary,created_at,queued_at,completed_at").eq("organization_id", context.organizationId).eq("store_id", storeId).order("created_at", { ascending: false }),
      admin.from("customer_segments").select("id,name,active").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).order("name"),
      admin.from("customers").select("id,name,phone_normalized,orders_count,last_order_at").eq("organization_id", context.organizationId).is("deleted_at", null).order("name").limit(500),
      admin.from("orders").select("customer_id").eq("organization_id", context.organizationId).eq("store_id", storeId).not("customer_id", "is", null),
      admin.from("customer_marketing_preferences").select("customer_id,status,source,consented_at,opted_out_at").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("channel", "whatsapp"),
      admin.from("campaign_recipients").select("campaign_id,status").eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("store_conversation_settings").select("whatsapp_enabled,connection_status,whatsapp_phone_number_id,access_token_secret_ref").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    for (const result of [settings, campaigns, segments, customers, customerOrders, preferences, recipients, whatsapp]) if (result.error) throw result.error;
    const preferenceMap = new Map((preferences.data ?? []).map((item) => [item.customer_id, item]));
    const recipientCounts = new Map<string, Record<string, number>>();
    for (const recipient of recipients.data ?? []) {
      const counts = recipientCounts.get(recipient.campaign_id) ?? {};
      counts[recipient.status] = (counts[recipient.status] ?? 0) + 1;
      recipientCounts.set(recipient.campaign_id, counts);
    }
    const storeCustomerIds = new Set((customerOrders.data ?? []).map((order) => order.customer_id).filter(Boolean));
    const customerRows = (customers.data ?? []).filter((customer) => storeCustomerIds.has(customer.id)).map((customer) => ({ ...customer, preference: preferenceMap.get(customer.id) ?? null }));
    return {
      context,
      enabled: Boolean(settings.data?.growth_campaigns_enabled),
      ratePerMinute: Number(settings.data?.campaign_rate_per_minute ?? 10),
      whatsappReady: Boolean(whatsapp.data?.whatsapp_enabled && whatsapp.data?.connection_status === "connected" && whatsapp.data?.whatsapp_phone_number_id && whatsapp.data?.access_token_secret_ref),
      eligibleCustomers: customerRows.filter((customer) => customer.preference?.status === "consented" && customer.phone_normalized).length,
      optedOutCustomers: customerRows.filter((customer) => customer.preference?.status === "opted_out").length,
      notConsentedCustomers: customerRows.filter((customer) => !customer.preference || customer.preference.status === "not_consented").length,
      customers: customerRows,
      segments: segments.data ?? [],
      campaigns: (campaigns.data ?? []).map((campaign) => ({ ...campaign, recipientCounts: recipientCounts.get(campaign.id) ?? {} })),
    };
  }

  static async setMarketingPreference(customerId: string, status: "consented" | "opted_out" | "not_consented") {
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("customer_marketing_preference_internal", {
      p_store_id: storeId, p_customer_id: customerId, p_channel: "whatsapp", p_status: status, p_source: "manual", p_actor_user_id: context.userId,
    });
    if (error) throw error;
    await AuditService.record(context, { action: "growth.customer_marketing_preference_updated", entityType: "customer", entityId: customerId, after: { channel: "whatsapp", status } });
    return data;
  }

  static async enqueueCampaign(campaignId: string) {
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const [campaignResult, channelResult] = await Promise.all([
      admin.from("campaigns").select("id").eq("id", campaignId).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("store_conversation_settings").select("whatsapp_enabled,connection_status,whatsapp_phone_number_id,access_token_secret_ref").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    if (campaignResult.error) throw campaignResult.error;
    if (channelResult.error) throw channelResult.error;
    const campaign = campaignResult.data;
    if (!campaign) throw new Error("Campanha não encontrada nesta unidade.");
    const channel = channelResult.data;
    if (!channel?.whatsapp_enabled || channel.connection_status !== "connected" || !channel.whatsapp_phone_number_id || !channel.access_token_secret_ref) {
      throw new Error("Conecte e valide o canal oficial do WhatsApp antes de enfileirar a campanha.");
    }
    const { data, error } = await admin.rpc("campaign_enqueue_internal", { p_campaign_id: campaignId, p_actor_user_id: context.userId });
    if (error) throw error;
    return data as { campaign_id: string; eligible: number; excluded: number; status: string };
  }

  static async cancelCampaign(campaignId: string, reason: string) {
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: campaign, error: readError } = await admin.from("campaigns").select("id")
      .eq("id", campaignId).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;
    if (!campaign) throw new Error("Campanha não encontrada nesta unidade.");
    const { data, error } = await admin.rpc("campaign_cancel_internal", {
      p_campaign_id: campaignId, p_actor_user_id: context.userId, p_reason: reason,
    });
    if (error) throw error;
    return data as { campaign_id: string; status: "canceled"; recipients_canceled: number };
  }

  static async runScheduled(referenceDate?: string) {
    const context = await authorize(PERMISSIONS.GROWTH_CAMPAIGNS);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("growth_run_scheduled_automations_internal", {
      p_store_id: storeId,
      p_reference_date: referenceDate ?? new Date().toISOString().slice(0, 10),
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async loadCheckoutBenefits(storeSlug: string, token: string) {
    const current = await CartService.getCart(storeSlug, token);
    if (!current.cart || !("store" in current) || !current.store) throw new Error("Carrinho indisponível.");
    const admin = createAdminClient();
    const { cart, store } = current;
    const customerId = cart.customer_id as string | null;
    const [settings, cashback, loyalty] = await Promise.all([
      admin.from("store_growth_settings").select("cashback_enabled, cashback_rate_bps, loyalty_enabled, loyalty_redeem_cents_per_point").eq("organization_id", store.organization_id).eq("store_id", store.id).maybeSingle(),
      customerId ? admin.from("cashback_accounts").select("balance_cents").eq("organization_id", store.organization_id).eq("store_id", store.id).eq("customer_id", customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      customerId ? admin.from("loyalty_accounts").select("balance_points").eq("organization_id", store.organization_id).eq("store_id", store.id).eq("customer_id", customerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    for (const result of [settings, cashback, loyalty]) if (result.error) throw result.error;
    return {
      customerIdentified: Boolean(customerId),
      cashbackEnabled: Boolean(settings.data?.cashback_enabled),
      loyaltyEnabled: Boolean(settings.data?.loyalty_enabled),
      cashbackBalanceCents: moneyNumber(cashback.data?.balance_cents),
      loyaltyBalancePoints: moneyNumber(loyalty.data?.balance_points),
      loyaltyRedeemCentsPerPoint: moneyNumber(settings.data?.loyalty_redeem_cents_per_point ?? 1),
      current: {
        couponCode: cart.coupon_code_snapshot as string | null,
        couponDiscountCents: moneyNumber(cart.coupon_discount_cents),
        cashbackRedeemCents: moneyNumber(cart.cashback_redeem_requested_cents),
        cashbackDiscountCents: moneyNumber(cart.cashback_discount_cents),
        loyaltyRedeemPoints: moneyNumber(cart.loyalty_redeem_requested_points),
        loyaltyDiscountCents: moneyNumber(cart.loyalty_discount_cents),
      },
    };
  }

  static async applyCartBenefits(storeSlug: string, token: string, input: CartBenefitsInput) {
    const values = cartBenefitsSchema.parse(input);
    const current = await CartService.getCart(storeSlug, token);
    if (!current.cart || !("store" in current) || !current.store) throw new Error("Carrinho indisponível.");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("growth_set_cart_benefits_internal", {
      p_store_id: current.store.id,
      p_token_hash: hashCartToken(token),
      p_coupon_code: values.couponCode,
      p_cashback_redeem_cents: values.cashbackRedeemCents,
      p_loyalty_redeem_points: values.loyaltyRedeemPoints,
    });
    if (error) throw error;
    return data;
  }

  static async clearCartBenefits(storeSlug: string, token: string) {
    const current = await CartService.getCart(storeSlug, token);
    if (!current.cart || !("store" in current) || !current.store) throw new Error("Carrinho indisponível.");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("growth_clear_cart_benefits_internal", {
      p_store_id: current.store.id,
      p_token_hash: hashCartToken(token),
    });
    if (error) throw error;
    return data;
  }
}
