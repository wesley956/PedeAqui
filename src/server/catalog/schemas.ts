import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});

export const productAvailabilitySchema = z.enum(["available", "sold_out", "inactive"]);

export const productInputSchema = z.object({
  categoryId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000),
  promotionalPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  costCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  preparationTimeMinutes: z.number().int().min(0).max(1440).default(0),
  active: z.boolean().default(true),
  availability: productAvailabilitySchema.default("available"),
}).superRefine((value, ctx) => {
  if (value.promotionalPriceCents !== null && value.promotionalPriceCents !== undefined && value.promotionalPriceCents > value.priceCents) {
    ctx.addIssue({
      code: "custom",
      path: ["promotionalPriceCents"],
      message: "Promotional price cannot be greater than regular price",
    });
  }
});

export const modifierGroupInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(240).nullable().optional(),
  minSelection: z.number().int().min(0).max(100).default(0),
  maxSelection: z.number().int().min(1).max(100).default(1),
  required: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.minSelection > value.maxSelection) {
    ctx.addIssue({ code: "custom", path: ["minSelection"], message: "Minimum cannot exceed maximum" });
  }
  if (value.required && value.minSelection < 1) {
    ctx.addIssue({ code: "custom", path: ["minSelection"], message: "Required groups must require at least one selection" });
  }
});

export const modifierInputSchema = z.object({
  modifierGroupId: uuidSchema,
  name: z.string().trim().min(1).max(100),
  priceCents: z.number().int().min(0).max(100_000_000).default(0),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});

export const productModifierGroupLinkSchema = z.object({
  productId: uuidSchema,
  modifierGroupId: uuidSchema,
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export type CategoryInput = z.input<typeof categoryInputSchema>;
export type ProductInput = z.input<typeof productInputSchema>;
export type ProductAvailability = z.infer<typeof productAvailabilitySchema>;
export type ModifierGroupInput = z.input<typeof modifierGroupInputSchema>;
export type ModifierInput = z.input<typeof modifierInputSchema>;
