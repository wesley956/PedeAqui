import { z } from "zod";

export const deliverySettingsInputSchema = z.object({
  enabled: z.boolean().default(true),
  feeMode: z.enum(["default", "neighborhood"]).default("neighborhood"),
  defaultFeeCents: z.number().int().nonnegative().default(0),
  freeDeliveryOverCents: z.number().int().nonnegative().nullable().optional(),
  estimatedMinMinutes: z.number().int().min(0).max(1440).default(30),
  estimatedMaxMinutes: z.number().int().min(0).max(1440).default(60),
  maxDistanceKm: z.number().positive().max(9999).nullable().optional(),
  requireNeighborhoodMatch: z.boolean().default(true),
}).refine((value) => value.estimatedMinMinutes <= value.estimatedMaxMinutes, {
  message: "Minimum ETA must not exceed maximum ETA",
});

export type DeliverySettingsInput = z.infer<typeof deliverySettingsInputSchema>;

export const deliveryNeighborhoodInputSchema = z.object({
  neighborhoodName: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  feeCents: z.number().int().nonnegative(),
  minimumOrderCents: z.number().int().nonnegative().nullable().optional(),
  additionalMinutes: z.number().int().min(0).max(1440).default(0),
  active: z.boolean().default(true),
});

export type DeliveryNeighborhoodInput = z.infer<typeof deliveryNeighborhoodInputSchema>;

export const publicDeliverySummarySchema = z.object({
  enabled: z.boolean(),
  fee_mode: z.enum(["default", "neighborhood"]),
  default_fee_cents: z.number().int().nonnegative(),
  free_delivery_over_cents: z.number().int().nonnegative().nullable(),
  estimated_min_minutes: z.number().int().nonnegative(),
  estimated_max_minutes: z.number().int().nonnegative(),
  starting_fee_cents: z.number().int().nonnegative(),
});
