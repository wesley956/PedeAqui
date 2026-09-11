import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

export type ProductPromotion = {
  id: string;
  promotion_group_id: string;
  campaign_name: string | null;
  organization_id: string;
  store_id: string;
  product_id: string;
  promotional_price_cents: number;
  weekdays: number[];
  starts_on: string | null;
  ends_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  label: string | null;
  active: boolean;
};

export type PromotionCampaignItemInput = {
  productId: string;
  promotionalPriceCents: number;
  weekdays: number[];
  startsOn?: string | null;
  endsOn?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type PromotionCampaignInput = {
  campaignName?: string | null;
  items: PromotionCampaignItemInput[];
  label?: string | null;
  active?: boolean;
};

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return {
    date: `${year}-${month}-${day}`,
    weekday: WEEKDAY[value("weekday")] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function timeMinutes(value: string | null) {
  if (!value) return null;
  const [hour = 0, minute = 0] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function previousWeekday(value: number) { return (value + 6) % 7; }

export function isPromotionActive(promotion: ProductPromotion, timeZone: string, now = new Date()) {
  if (!promotion.active) return false;
  const local = localParts(now, timeZone);
  const start = timeMinutes(promotion.starts_at);
  const end = timeMinutes(promotion.ends_at);
  const overnight = start !== null && end !== null && end <= start;
  const afterMidnight = overnight && local.minutes < end!;
  const applicableWeekday = afterMidnight ? previousWeekday(local.weekday) : local.weekday;

  if (!promotion.weekdays.includes(applicableWeekday)) return false;

  let applicableDate = local.date;
  if (afterMidnight) {
    const localNoon = new Date(`${local.date}T12:00:00Z`);
    localNoon.setUTCDate(localNoon.getUTCDate() - 1);
    applicableDate = localNoon.toISOString().slice(0, 10);
  }
  if (promotion.starts_on && applicableDate < promotion.starts_on) return false;
  if (promotion.ends_on && applicableDate > promotion.ends_on) return false;

  if (start === null && end === null) return true;
  if (start !== null && end === null) return local.minutes >= start;
  if (start === null && end !== null) return local.minutes < end;
  if (!overnight) return local.minutes >= start! && local.minutes < end!;
  return local.minutes >= start! || local.minutes < end!;
}

function normalizeWeekdays(weekdays: number[], productId: string) {
  const normalized = [...new Set(weekdays)].sort((a, b) => a - b);
  if (normalized.length === 0 || normalized.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error(`Selecione pelo menos um dia válido para o produto ${productId}.`);
  }
  return normalized;
}

function normalizeInput(input: PromotionCampaignInput) {
  const items = input.items.filter((item) => item.productId).map((item) => ({
    ...item,
    weekdays: normalizeWeekdays(item.weekdays, item.productId),
  }));
  if (items.length === 0) throw new Error("Selecione pelo menos um produto para a promoção.");
  if (items.some((item) => !Number.isInteger(item.promotionalPriceCents) || item.promotionalPriceCents < 0)) {
    throw new Error("Informe um preço promocional válido para cada produto selecionado.");
  }
  for (const item of items) {
    if (item.startsOn && item.endsOn && item.endsOn < item.startsOn) {
      throw new Error("A data final não pode ser anterior à data inicial.");
    }
  }
  const campaignName = input.campaignName?.trim() || null;
  if (campaignName && campaignName.length > 80) throw new Error("O nome da promoção deve ter no máximo 80 caracteres.");
  const label = input.label?.trim() || null;
  if (label && label.length > 48) throw new Error("O texto da promoção deve ter no máximo 48 caracteres.");
  return { ...input, items, campaignName, label, active: input.active ?? true };
}

function isMissingPromotionRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42883" || error.code === "42P01" || /get_public_product_promotions|product_promotions/i.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "");
}

async function publicSchedules(storeId: string): Promise<ProductPromotion[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_public_product_promotions", { p_store_id: storeId });
  if (error && isMissingPromotionRpc(error)) return [];
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data as ProductPromotion[];
}

function cheapestActive(schedules: ProductPromotion[], timeZone: string, now: Date) {
  return schedules
    .filter((row) => isPromotionActive(row, timeZone, now))
    .sort((a, b) => a.promotional_price_cents - b.promotional_price_cents)[0] ?? null;
}

export class PromotionService {
  static async list() {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    if (!context.storeId) throw new Error("An active store is required for promotions");
    const admin = createAdminClient();
    const { data, error } = await admin.from("product_promotions")
      .select("id,promotion_group_id,campaign_name,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async saveCampaign(input: PromotionCampaignInput) {
    const values = normalizeInput(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required for promotions");
    const admin = createAdminClient();
    const productIds = [...new Set(values.items.map((item) => item.productId))];
    const { data: products, error: productError } = await admin.from("products")
      .select("id,name,price_cents,active,availability,deleted_at")
      .in("id", productIds)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .is("deleted_at", null);
    if (productError) throw productError;
    if (!products || products.length !== productIds.length) throw new Error("Um ou mais produtos não foram encontrados na loja ativa.");

    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of values.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error("Produto não encontrado na loja ativa.");
      if (item.promotionalPriceCents > Number(product.price_cents)) {
        throw new Error(`O preço promocional de ${product.name} não pode ser maior que o preço normal.`);
      }
    }

    const groupId = randomUUID();
    const now = new Date().toISOString();
    const rows = values.items.map((item) => ({
      promotion_group_id: groupId,
      campaign_name: values.campaignName,
      organization_id: context.organizationId,
      store_id: context.storeId,
      product_id: item.productId,
      promotional_price_cents: item.promotionalPriceCents,
      weekdays: item.weekdays,
      starts_on: item.startsOn || null,
      ends_on: item.endsOn || null,
      starts_at: item.startsAt || null,
      ends_at: item.endsAt || null,
      label: values.label,
      active: values.active,
      created_by: context.userId,
      updated_by: context.userId,
      created_at: now,
      updated_at: now,
    }));

    const { data, error } = await admin.from("product_promotions")
      .insert(rows)
      .select("id,promotion_group_id,campaign_name,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active");
    if (error) throw error;

    await AuditService.record(context, { action: "promotion.campaign_created", entityType: "promotion_campaign", entityId: groupId, before: null, after: data });
    await EventService.enqueue(context, { type: "promotion.campaign_created", entityType: "promotion_campaign", entityId: groupId, payload: { product_ids: productIds, campaign_name: values.campaignName } });
    return data ?? [];
  }

  static async removeCampaign(groupId: string) {
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required for promotions");
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("product_promotions")
      .select("*")
      .eq("promotion_group_id", groupId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId);
    if (beforeError) throw beforeError;
    if (!before || before.length === 0) return;
    const { error } = await admin.from("product_promotions")
      .delete()
      .eq("promotion_group_id", groupId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "promotion.campaign_deleted", entityType: "promotion_campaign", entityId: groupId, before, after: null });
    await EventService.enqueue(context, { type: "promotion.campaign_deleted", entityType: "promotion_campaign", entityId: groupId, payload: { product_ids: before.map((row) => row.product_id) } });
  }

  static async schedulesForStore(storeId: string) {
    return publicSchedules(storeId);
  }

  static async schedulesForProduct(storeId: string, productId: string) {
    const schedules = await publicSchedules(storeId);
    return schedules.filter((row) => row.product_id === productId);
  }

  static async scheduleForProduct(storeId: string, productId: string) {
    const schedules = await this.schedulesForProduct(storeId, productId);
    return schedules[0] ?? null;
  }

  static async activeForStore(storeId: string, timeZone: string, now = new Date()) {
    const schedules = await publicSchedules(storeId);
    return schedules.filter((row) => isPromotionActive(row, timeZone, now));
  }

  static async activeForProduct(storeId: string, productId: string, timeZone: string, now = new Date()) {
    const schedules = await this.schedulesForProduct(storeId, productId);
    return cheapestActive(schedules, timeZone, now);
  }

  static async effectiveForProduct(storeId: string, productId: string, timeZone: string, now = new Date()) {
    const schedules = await this.schedulesForProduct(storeId, productId);
    return {
      hasSchedule: schedules.length > 0,
      promotion: cheapestActive(schedules, timeZone, now),
    };
  }
}
