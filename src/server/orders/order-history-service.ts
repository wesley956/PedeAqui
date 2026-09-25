import "server-only";

import { z } from "zod";
import { DEFAULT_STORE_TIMEZONE } from "@/lib/store-date-time";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export const orderHistoryPeriodSchema = z.enum(["all", "today", "week", "fortnight", "month", "date"]);
export type OrderHistoryPeriod = z.infer<typeof orderHistoryPeriodSchema>;

const historySearchSchema = z.string().trim().max(80).transform((value) => value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim());
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

function calendarDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseCalendarDate(value: string) {
  const parsed = calendarDateSchema.safeParse(value);
  if (!parsed.success) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

function shiftCalendarDate(value: string, days: number) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function startOfWeek(value: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) return value;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return shiftCalendarDate(value, -daysSinceMonday);
}

/** Convert a store-local midnight to an exact UTC instant without assuming a fixed offset. */
function storeMidnightToIso(value: string, timeZone: string) {
  const parsed = parseCalendarDate(value);
  if (!parsed) throw new Error("Invalid calendar date");

  const desiredWallClock = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0);
  let instant = desiredWallClock;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  // Two passes cover offset changes around DST boundaries as well as fixed-offset zones.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const observedWallClock = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    instant += desiredWallClock - observedWallClock;
  }

  return new Date(instant).toISOString();
}

function resolveDateRange(period: OrderHistoryPeriod, selectedDate: string | undefined, timeZone: string, now = new Date()) {
  if (period === "all") return null;

  const today = calendarDateInTimeZone(now, timeZone);
  let startDate = today;
  let endDate = shiftCalendarDate(today, 1);

  if (period === "week") startDate = startOfWeek(today);
  if (period === "fortnight") startDate = shiftCalendarDate(today, -14);
  if (period === "month") startDate = startOfMonth(today);
  if (period === "date") {
    const validSelectedDate = selectedDate ? parseCalendarDate(selectedDate) : null;
    if (!validSelectedDate) return null;
    startDate = selectedDate!;
    endDate = shiftCalendarDate(startDate, 1);
  }

  return {
    startDate,
    endDate,
    startIso: storeMidnightToIso(startDate, timeZone),
    endIso: storeMidnightToIso(endDate, timeZone),
  };
}

export class OrderHistoryService {
  static async list(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    period?: string;
    date?: string;
  } = {}) {
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Math.trunc(input.pageSize ?? 30)));
    const search = historySearchSchema.parse(input.search ?? "");
    const period = orderHistoryPeriodSchema.catch("all").parse(input.period ?? "all");
    const selectedDate = input.date && parseCalendarDate(input.date) ? input.date : "";
    const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;
    const dateRange = resolveDateRange(period, selectedDate || undefined, timeZone);

    const applyFilters = <T extends {
      eq: (column: string, value: string | number) => T;
      ilike: (column: string, pattern: string) => T;
      gte: (column: string, value: string) => T;
      lt: (column: string, value: string) => T;
    }>(query: T) => {
      let filtered = query;
      if (search) {
        const number = /^#?\d+$/.test(search) ? Number(search.replace("#", "")) : null;
        filtered = number === null
          ? filtered.ilike("customer_name_snapshot", `%${search}%`)
          : filtered.eq("display_number", number);
      }
      if (dateRange) {
        filtered = filtered.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
      }
      return filtered;
    };

    const baseQuery = admin.from("orders")
      .select("id, display_number, channel, fulfillment_type, order_status, payment_status, production_status, fulfillment_status, customer_name_snapshot, total_cents, scheduled_for, created_at, updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_status", ["completed", "rejected", "canceled"]);

    const countQuery = admin.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_status", ["completed", "rejected", "canceled"]);

    const from = (page - 1) * pageSize;
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      applyFilters(baseQuery)
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1),
      applyFilters(countQuery),
    ]);

    if (error) throw error;
    if (countError) throw countError;
    const total = count ?? 0;

    return {
      context,
      orders: data ?? [],
      page,
      pageSize,
      search,
      period,
      selectedDate,
      dateRange,
      total,
      hasPrevious: page > 1,
      hasNext: from + pageSize < total,
    };
  }
}
