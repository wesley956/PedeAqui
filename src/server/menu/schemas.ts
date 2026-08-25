import { z } from "zod";
import { publicDeliverySummarySchema } from "@/server/delivery/schemas";
import { BUSINESS_TYPES } from "@/modules/module-catalog";

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const menuSettingsInputSchema = z.object({
  primaryColor: hexColorSchema.default("#FF6B00"),
  logoUrl: z.string().url().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  showSearch: z.boolean().default(true),
  showCategories: z.boolean().default(true),
  showProductImages: z.boolean().default(true),
  allowPickup: z.boolean().default(true),
  allowDelivery: z.boolean().default(true),
  minimumOrderCents: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
}).refine((value) => value.allowPickup || value.allowDelivery, { message: "At least one fulfillment mode must remain enabled" });

export type MenuSettingsInput = z.infer<typeof menuSettingsInputSchema>;
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const storeHourInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: clockSchema,
  closesAt: clockSchema,
  closesNextDay: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
}).refine((value) => value.closesNextDay ? value.closesAt < value.opensAt : value.opensAt < value.closesAt, { message: "Invalid opening interval" });

export type StoreHourInput = z.infer<typeof storeHourInputSchema>;

export const publicModifierSchema = z.object({ id: z.string().uuid(), name: z.string(), price_cents: z.number().int().nonnegative() });
export const publicModifierGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  min_selection: z.number().int().nonnegative(),
  max_selection: z.number().int().positive(),
  required: z.boolean(),
  selection_mode: z.enum(["distinct_choices", "quantity_per_option", "equal_split_options"]).default("distinct_choices"),
  distribution_total: z.number().int().positive().nullable().default(null),
  modifiers: z.array(publicModifierSchema),
});

export const publicProductSummarySchema = z.object({
  id: z.string().uuid(), name: z.string(), description: z.string().nullable(), image_url: z.string().nullable(),
  price_cents: z.number().int().nonnegative(), promotional_price_cents: z.number().int().nonnegative().nullable(),
  preparation_time_minutes: z.number().int().nonnegative(), availability: z.enum(["available", "sold_out"]),
});
export const publicCategorySchema = z.object({ id: z.string().uuid(), name: z.string(), description: z.string().nullable(), image_url: z.string().nullable(), products: z.array(publicProductSummarySchema) });
export const publicHourSchema = z.object({ weekday: z.number().int().min(0).max(6), opens_at: clockSchema, closes_at: clockSchema, closes_next_day: z.boolean() });

export const publicMenuSchema = z.object({
  store: z.object({
    id: z.string().uuid(), name: z.string(), slug: z.string(), phone: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(),
    timezone: z.string(), status: z.enum(["active", "temporarily_closed"]), business_type: z.enum(BUSINESS_TYPES),
  }),
  settings: z.object({
    theme: z.string(), primary_color: hexColorSchema, logo_url: z.string().nullable(), cover_url: z.string().nullable(), show_search: z.boolean(),
    show_categories: z.boolean(), show_product_images: z.boolean(), allow_pickup: z.boolean(), allow_delivery: z.boolean(), minimum_order_cents: z.number().int().nonnegative(),
    active: z.boolean(), accepting_orders: z.boolean(), pause_reason: z.string().nullable(),
  }),
  delivery: publicDeliverySummarySchema,
  hours: z.array(publicHourSchema),
  categories: z.array(publicCategorySchema),
});
export type PublicMenu = z.infer<typeof publicMenuSchema>;

export const publicProductSchema = z.object({
  store: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), status: z.enum(["active", "temporarily_closed"]), timezone: z.string(), business_type: z.enum(BUSINESS_TYPES) }),
  settings: z.object({ active: z.boolean(), accepting_orders: z.boolean(), pause_reason: z.string().nullable() }),
  hours: z.array(publicHourSchema),
  product: publicProductSummarySchema.extend({ modifier_groups: z.array(publicModifierGroupSchema) }),
});
export type PublicProduct = z.infer<typeof publicProductSchema>;
