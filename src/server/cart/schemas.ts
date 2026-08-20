import { z } from "zod";

export const gasSaleModeSchema = z.enum(["exchange", "with_container"]);
export type GasSaleMode = z.infer<typeof gasSaleModeSchema>;

export const addCartItemSchema = z.object({
  storeSlug: z.string().trim().min(2).max(63).regex(/^[a-z0-9][a-z0-9-]*$/),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(500).nullable().optional(),
  modifierIds: z.array(z.string().uuid()).max(50).default([]),
  gasSaleMode: gasSaleModeSchema.nullable().optional(),
});

export const cartItemQuantitySchema = z.object({
  storeSlug: z.string().trim().min(2).max(63).regex(/^[a-z0-9][a-z0-9-]*$/),
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

export const removeCartItemSchema = z.object({
  storeSlug: z.string().trim().min(2).max(63).regex(/^[a-z0-9][a-z0-9-]*$/),
  itemId: z.string().uuid(),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
