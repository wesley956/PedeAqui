import { z } from "zod";

export const gasSaleModeSchema = z.enum(["exchange", "with_container"]);
export type GasSaleMode = z.infer<typeof gasSaleModeSchema>;

export const modifierSelectionSchema = z.object({
  modifierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
});

export const addCartItemSchema = z.object({
  storeSlug: z.string().trim().min(2).max(63).regex(/^[a-z0-9][a-z0-9-]*$/),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(500).nullable().optional(),
  modifierIds: z.array(z.string().uuid()).max(50).default([]),
  modifierSelections: z.array(modifierSelectionSchema).max(100).default([]),
  gasSaleMode: gasSaleModeSchema.nullable().optional(),
}).superRefine((value, ctx) => {
  const ids = value.modifierSelections.map((selection) => selection.modifierId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", path: ["modifierSelections"], message: "Duplicate modifier selection" });
  }
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
