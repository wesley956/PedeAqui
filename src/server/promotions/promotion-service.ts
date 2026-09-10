import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

export type ProductPromotion = {
  id: string;
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

export type PromotionInput = {
  productId: string;
  promotionalPriceCents: number;
  weekdays: number[];
  startsOn?: string | null;
  endsOn?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
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
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
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

  // Date boundaries are evaluated in the store timezone. For an overnight window,
  // the after-midnight portion belongs to the previous scheduled day.
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

function normalizeInput(input: PromotionInput) {
  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
  if (weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Selecione pelo menos um dia válido para a promoção.");
  }
  if (!Number.isInteger(input.promotionalPriceCents) || input.promotionalPriceCents < 0) {
    throw new Error("Informe um preço promocional válido.");
  }
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    throw new Error("A data final não pode ser anterior à data inicial.");
  }
  const label = input.label?.trim() || null;
  if (label && label.length > 48) throw new Error("O texto da promoção deve ter no máximo 48 caracteres.");
  return { ...input, weekdays, label, active: input.active ?? true };
}

export class PromotionService {
  static async list() {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    if (!context.storeId) throw new Error("An active store is required for promotions");
    const admin = createAdminClient();
    const { data, error } = await admin.from("product_promotions")
      .select("id,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active,created_at,updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  static async save(input: PromotionInput) {
    const values = normalizeInput(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required for promotions");
    const admin = createAdminClient();
    const { data: product, error: productError } = await admin.from("products")
      .select("id,name,price_cents,active,availability,deleted_at")
      .eq("id", values.productId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new Error("Produto não encontrado na loja ativa.");
    if (values.promotionalPriceCents > Number(product.price_cents)) {
      throw new Error("O preço promocional não pode ser maior que o preço normal.");
    }

    const row = {
      organization_id: context.organizationId,
      store_id: context.storeId,
      product_id: values.productId,
      promotional_price_cents: values.promotionalPriceCents,
      weekdays: values.weekdays,
      starts_on: values.startsOn || null,
      ends_on: values.endsOn || null,
      starts_at: values.startsAt || null,
      ends_at: values.endsAt || null,
      label: values.label,
      active: values.active,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: before } = await admin.from("product_promotions")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("product_id", values.productId)
      .maybeSingle();
    const { data, error } = await admin.from("product_promotions")
      .upsert({ ...row, created_by: before?.created_by ?? context.userId }, { onConflict: "organization_id,store_id,product_id" })
      .select("id,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active")
      .single();
    if (error) throw error;
    await AuditService.record(context, { action: before ? "promotion.updated" : "promotion.created", entityType: "product_promotion", entityId: data.id, before, after: data });
    await EventService.enqueue(context, { type: before ? "promotion.updated" : "promotion.created", entityType: "product_promotion", entityId: data.id, payload: { product_id: product.id, product_name: product.name } });
    return data;
  }

  static async remove(promotionId: string) {
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required for promotions");
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("product_promotions")
      .select("*").eq("id", promotionId).eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return;
    const { error } = await admin.from("product_promotions").delete().eq("id", promotionId).eq("organization_id", context.organizationId).eq("store_id", context.storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "promotion.deleted", entityType: "product_promotion", entityId: promotionId, before, after: null });
    await EventService.enqueue(context, { type: "promotion.deleted", entityType: "product_promotion", entityId: promotionId, payload: { product_id: before.product_id } });
  }

  static async activeForStore(storeId: string, timeZone: string, now = new Date()) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("product_promotions")
      .select("id,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active")
      .eq("store_id", storeId).eq("active", true);
    if (error) throw error;
    return (data ?? []).filter((row) => isPromotionActive(row as ProductPromotion, timeZone, now)) as ProductPromotion[];
  }

  static async activeForProduct(storeId: string, productId: string, timeZone: string, now = new Date()) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("product_promotions")
      .select("id,organization_id,store_id,product_id,promotional_price_cents,weekdays,starts_on,ends_on,starts_at,ends_at,label,active")
      .eq("store_id", storeId).eq("product_id", productId).eq("active", true).maybeSingle();
    if (error) throw error;
    if (!data || !isPromotionActive(data as ProductPromotion, timeZone, now)) return null;
    return data as ProductPromotion;
  }
}
