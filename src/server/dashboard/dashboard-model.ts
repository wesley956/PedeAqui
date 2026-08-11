import { z } from "zod";

const hourlyPointSchema = z.object({
  hour: z.coerce.number().int().min(0).max(23),
  orders: z.coerce.number().int().nonnegative(),
  sales_cents: z.coerce.number().int().nonnegative(),
});

const topProductSchema = z.object({
  product_key: z.string().min(1),
  name: z.string().min(1),
  quantity: z.coerce.number().int().nonnegative(),
  sales_cents: z.coerce.number().int().nonnegative(),
});

export const dashboardSnapshotSchema = z.object({
  store_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  timezone: z.string().min(1),
  local_date: z.string().date(),
  generated_at: z.string().datetime({ offset: true }),
  sales_count: z.coerce.number().int().nonnegative(),
  sales_cents: z.coerce.number().int().nonnegative(),
  average_ticket_cents: z.coerce.number().int().nonnegative(),
  customer_count: z.coerce.number().int().nonnegative(),
  open_orders: z.coerce.number().int().nonnegative(),
  previous_sales_count: z.coerce.number().int().nonnegative(),
  previous_sales_cents: z.coerce.number().int().nonnegative(),
  hourly: z.array(hourlyPointSchema).length(24),
  top_products: z.array(topProductSchema).max(8),
});

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type DashboardHourlyPoint = z.infer<typeof hourlyPointSchema>;
export type DashboardTopProduct = z.infer<typeof topProductSchema>;

export function percentageDelta(current: number, previous: number) {
  if (![current, previous].every(Number.isFinite) || current < 0 || previous < 0) {
    throw new Error("Dashboard values must be finite and non-negative");
  }
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function maxHourlySales(points: readonly DashboardHourlyPoint[]) {
  let max = 0;
  for (const point of points) if (point.sales_cents > max) max = point.sales_cents;
  return max;
}

export function hourlyBarPercent(value: number, max: number) {
  if (![value, max].every(Number.isFinite) || value < 0 || max < 0) throw new Error("Invalid hourly chart value");
  if (max === 0 || value === 0) return 0;
  return Math.max(4, Math.min(100, (value / max) * 100));
}
