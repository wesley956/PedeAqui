import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG, MODULE_KEYS, isBusinessType, moduleLabel, profileSupportsModule, type ModuleKey } from "@/modules/module-catalog";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export type ReadinessTone = "good" | "warn" | "danger";
export type ReadinessCheck = {
  key: string;
  label: string;
  detail: string;
  tone: ReadinessTone;
  blocking: boolean;
};

const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
};

const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localClock(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value: Record<string, string> = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: weekdayMap[value.weekday ?? "Sun"] ?? 0, minutes: Number(value.hour ?? "0") * 60 + Number(value.minute ?? "0") };
}

function timeToMinutes(value: string) {
  const [hour = 0, minute = 0] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function storeIsOpenNow(hours: Array<{ weekday: number; opens_at: string; closes_at: string; closes_next_day: boolean }>, timeZone: string) {
  const now = localClock(timeZone);
  const previousWeekday = (now.weekday + 6) % 7;
  return hours.some((period) => {
    const opens = timeToMinutes(period.opens_at);
    const closes = timeToMinutes(period.closes_at);
    if (period.weekday === now.weekday) return period.closes_next_day ? now.minutes >= opens : now.minutes >= opens && now.minutes < closes;
    return period.weekday === previousWeekday && period.closes_next_day && now.minutes < closes;
  });
}

export class PlatformRestaurant360Service {
  static async load(organizationId: string, storeId: string) {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const [organization, store, menu, hours, products, delivery, neighborhoods, payments, whatsapp, printAgents, printers, orders, members, invitations, subscription, audit, moduleRows, experiencePreferences] = await Promise.all([
      admin.from("organizations").select("id,name,status,created_at,updated_at").eq("id", organizationId).maybeSingle(),
      admin.from("stores").select("id,organization_id,name,slug,status,city,state,timezone,is_primary,business_type,module_preset,module_catalog_version,module_config_revision,updated_at").eq("id", storeId).eq("organization_id", organizationId).maybeSingle(),
      admin.from("store_menu_settings").select("active,accepting_orders,allow_delivery,allow_pickup,pause_reason,updated_at").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("store_hours").select("weekday,opens_at,closes_at,closes_next_day,active").eq("organization_id", organizationId).eq("store_id", storeId).eq("active", true).order("weekday").order("sort_order"),
      admin.from("products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("store_id", storeId).eq("active", true).neq("availability", "inactive").is("deleted_at", null),
      admin.from("store_delivery_settings").select("enabled,fee_mode,default_fee_cents,estimated_min_minutes,estimated_max_minutes,require_neighborhood_match,updated_at").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("delivery_neighborhoods").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null),
      admin.from("store_payment_methods").select("method,enabled,sort_order").eq("organization_id", organizationId).eq("store_id", storeId).order("sort_order"),
      admin.from("store_conversation_settings").select("whatsapp_enabled,whatsapp_phone_number_id,default_bot_enabled,updated_at").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("print_agents").select("id,name,status,active,last_seen_at").eq("organization_id", organizationId).eq("store_id", storeId).eq("active", true),
      admin.from("printers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("store_id", storeId).eq("active", true),
      admin.from("orders").select("id,display_number,order_status,payment_status,production_status,fulfillment_status,created_at,updated_at").eq("organization_id", organizationId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(10),
      admin.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
      admin.from("invitations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("accepted_at", null).gt("expires_at", now),
      admin.from("organization_subscriptions").select("id,plan_id,status,billing_interval,current_period_end,trial_ends_at,grace_ends_at,cancel_at_period_end,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("audit_logs").select("id,action,entity_type,request_id,created_at").eq("organization_id", organizationId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(8),
      admin.from("store_modules").select("module_key,enabled,configuration_source,catalog_version,updated_at").eq("organization_id", organizationId).eq("store_id", storeId),
      admin.from("user_store_preferences").select("experience_mode").eq("organization_id", organizationId).eq("store_id", storeId),
    ]);

    for (const result of [organization, store, menu, hours, products, delivery, neighborhoods, payments, whatsapp, printAgents, printers, orders, members, invitations, subscription, audit, moduleRows, experiencePreferences]) {
      if (result.error) throw result.error;
    }
    if (!organization.data || !store.data) return null;

    const planResult = subscription.data?.plan_id
      ? await admin.from("plans").select("id,name,key").eq("id", subscription.data.plan_id).maybeSingle()
      : { data: null, error: null };
    if (planResult.error) throw planResult.error;

    const rawBusinessType = String(store.data.business_type ?? "restaurant");
    const businessType = isBusinessType(rawBusinessType) ? rawBusinessType : "restaurant";
    const vocabulary = businessVocabulary(businessType);
    const moduleState = new Map<ModuleKey, boolean>();
    for (const row of moduleRows.data ?? []) {
      const key = String(row.module_key) as ModuleKey;
      if ((MODULE_KEYS as readonly string[]).includes(key)) moduleState.set(key, row.enabled === true);
    }
    const enabledModuleKeys = new Set<ModuleKey>(MODULE_KEYS.filter((key) => moduleState.get(key) ?? businessType === "restaurant"));
    const entitlementAllowed = new Map<ModuleKey, boolean>();
    await Promise.all(MODULE_KEYS.map(async (key) => {
      const featureKey = MODULE_CATALOG[key].entitlementFeatureKey;
      if (!featureKey) { entitlementAllowed.set(key, true); return; }
      const { data, error } = await admin.rpc("organization_entitlement_internal", { p_organization_id: organizationId, p_feature_key: featureKey, p_at: now });
      if (error) throw error;
      entitlementAllowed.set(key, Boolean((data as { enabled?: boolean } | null)?.enabled));
    }));
    const supportedModules = MODULE_KEYS.filter((key) => profileSupportsModule(businessType, key));
    const activeModules = supportedModules.filter((key) => enabledModuleKeys.has(key)).map((key) => ({ key, label: moduleLabel(key, businessType) }));
    const inactiveModules = supportedModules.filter((key) => !enabledModuleKeys.has(key)).map((key) => ({ key, label: moduleLabel(key, businessType) }));
    const unavailableByPlan = supportedModules.filter((key) => entitlementAllowed.get(key) === false).map((key) => ({ key, label: moduleLabel(key, businessType) }));
    const dependencyIssues = activeModules.flatMap(({ key, label }) => MODULE_CATALOG[key].dependencies.filter((dependency) => !enabledModuleKeys.has(dependency)).map((dependency) => ({ moduleLabel: label, dependencyLabel: moduleLabel(dependency, businessType) })));
    const easyModeUsers = (experiencePreferences.data ?? []).filter((item) => item.experience_mode === "easy").length;
    const standardModeUsers = (experiencePreferences.data ?? []).filter((item) => item.experience_mode !== "easy").length;

    const activeHours = (hours.data ?? []) as Array<{ weekday: number; opens_at: string; closes_at: string; closes_next_day: boolean; active: boolean }>;
    const openNow = activeHours.length > 0 && storeIsOpenNow(activeHours, store.data.timezone || "America/Sao_Paulo");
    const menuData = menu.data;
    const enabledPayments = (payments.data ?? []).filter((row) => row.enabled);
    const deliveryModuleActive = enabledModuleKeys.has("deliveries");
    const deliveryRequested = deliveryModuleActive && Boolean(menuData?.allow_delivery);
    const pickupRequested = Boolean(menuData?.allow_pickup);
    const deliveryConfigured = !deliveryRequested || Boolean(delivery.data?.enabled);
    const neighborhoodConfigured = !deliveryRequested || !delivery.data?.require_neighborhood_match || (neighborhoods.count ?? 0) > 0;
    const whatsappHealthy = Boolean(whatsapp.data?.whatsapp_enabled && whatsapp.data?.whatsapp_phone_number_id);
    const onlinePrintAgents = (printAgents.data ?? []).filter((agent) => agent.status === "online").length;
    const catalogName = vocabulary.catalogLabel;

    const checks: ReadinessCheck[] = [
      { key: "store", label: "Unidade ativa", detail: store.data.status === "active" ? "A unidade está liberada para operar." : `Situação atual: ${store.data.status}.`, tone: store.data.status === "active" ? "good" : "danger", blocking: store.data.status !== "active" },
      { key: "menu", label: `${catalogName} publicado`, detail: menuData?.active ? `O ${catalogName.toLowerCase()} público está disponível.` : `O ${catalogName.toLowerCase()} está desativado ou ainda não foi configurado.`, tone: menuData?.active ? "good" : "danger", blocking: !menuData?.active },
      { key: "orders", label: "Recebimento de pedidos", detail: menuData?.accepting_orders ? "A unidade está aceitando novos pedidos." : (menuData?.pause_reason || "O recebimento de pedidos está pausado."), tone: menuData?.accepting_orders ? "good" : "danger", blocking: !menuData?.accepting_orders },
      { key: "products", label: "Produtos disponíveis", detail: (products.count ?? 0) > 0 ? `${products.count} produto(s) disponível(is) para venda.` : "Nenhum produto ativo e disponível foi encontrado.", tone: (products.count ?? 0) > 0 ? "good" : "danger", blocking: (products.count ?? 0) === 0 },
      { key: "hours", label: "Horários de funcionamento", detail: activeHours.length === 0 ? "Nenhum horário ativo está cadastrado." : openNow ? "A unidade está dentro do horário de funcionamento agora." : "Os horários existem, mas a unidade está fechada neste momento.", tone: activeHours.length === 0 ? "danger" : openNow ? "good" : "warn", blocking: activeHours.length === 0 || !openNow },
      { key: "fulfillment", label: "Entrega ou retirada", detail: deliveryRequested || pickupRequested ? `${deliveryRequested ? "Entrega" : ""}${deliveryRequested && pickupRequested ? " e " : ""}${pickupRequested ? "retirada" : ""} habilitada(s).` : deliveryModuleActive ? "Nenhuma modalidade de recebimento está habilitada." : "Entrega não faz parte da configuração atual; a prontidão não depende dela.", tone: deliveryRequested || pickupRequested || !deliveryModuleActive ? "good" : "danger", blocking: deliveryModuleActive && !(deliveryRequested || pickupRequested) },
      { key: "delivery", label: "Configuração de entrega", detail: !deliveryModuleActive ? "Módulo de entrega desativado para esta unidade." : !deliveryRequested ? "Entrega não é necessária para esta configuração." : deliveryConfigured && neighborhoodConfigured ? "Entrega possui configuração suficiente para cotação." : "A entrega está habilitada, mas falta configuração necessária.", tone: !deliveryModuleActive || !deliveryRequested || (deliveryConfigured && neighborhoodConfigured) ? "good" : "danger", blocking: deliveryModuleActive && deliveryRequested && !(deliveryConfigured && neighborhoodConfigured) },
      { key: "payments", label: "Meios de pagamento", detail: enabledPayments.length > 0 ? enabledPayments.map((item) => paymentLabels[item.method] ?? item.method).join(" · ") : "Nenhum meio de pagamento está habilitado.", tone: enabledPayments.length > 0 ? "good" : "danger", blocking: enabledPayments.length === 0 },
      { key: "whatsapp", label: "WhatsApp", detail: whatsappHealthy ? "Canal configurado para esta unidade." : "WhatsApp não está conectado ou exige configuração.", tone: whatsappHealthy ? "good" : "warn", blocking: false },
      { key: "printing", label: "Impressão", detail: (printers.count ?? 0) === 0 ? "Nenhuma impressora ativa configurada." : onlinePrintAgents > 0 ? `${onlinePrintAgents} agente(s) de impressão online.` : "Há impressora configurada, mas nenhum agente está online.", tone: (printers.count ?? 0) === 0 ? "warn" : onlinePrintAgents > 0 ? "good" : "warn", blocking: false },
    ];

    const blockers = checks.filter((check) => check.blocking);
    return {
      organization: organization.data,
      store: store.data,
      business: { type: businessType, label: vocabulary.businessLabel, catalogLabel: vocabulary.catalogLabel },
      modules: {
        preset: String(store.data.module_preset ?? "complete"),
        catalogVersion: Number(store.data.module_catalog_version) || 1,
        configRevision: Number(store.data.module_config_revision) || 0,
        active: activeModules,
        inactive: inactiveModules,
        unavailableByPlan,
        dependencyIssues,
        easyModeUsers,
        standardModeUsers,
      },
      subscription: subscription.data ? { ...subscription.data, planName: planResult.data?.name ?? "Plano não identificado" } : null,
      readiness: { ready: blockers.length === 0, blockers: blockers.length, checks, openNow },
      commercial: {
        productCount: products.count ?? 0,
        activeHours: activeHours.length,
        deliveryEnabled: deliveryModuleActive && Boolean(delivery.data?.enabled),
        neighborhoods: neighborhoods.count ?? 0,
        paymentMethods: enabledPayments.map((item) => paymentLabels[item.method] ?? item.method),
        whatsappHealthy,
        printAgentsOnline: onlinePrintAgents,
        printers: printers.count ?? 0,
      },
      access: { activeMembers: members.count ?? 0, pendingInvites: invitations.count ?? 0 },
      recentOrders: orders.data ?? [],
      recentAudit: audit.data ?? [],
    };
  }
}
