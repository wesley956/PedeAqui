import { z } from "zod";

export const diningTableInputSchema = z.object({
  code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  name: z.string().trim().min(1).max(80),
  capacity: z.coerce.number().int().min(1).max(100),
  area: z.string().trim().min(1).max(80).nullable().optional(),
  qrEnabled: z.boolean().default(false),
});

export const diningRoundInputSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
    note: z.string().trim().max(500).nullable(),
    modifierIds: z.array(z.string().uuid()).max(40),
  })).min(1).max(100),
});

export const diningMemberInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  customerId: z.string().uuid().nullable().optional(),
  seatNumber: z.number().int().min(1).max(999).nullable().optional(),
});

export const diningPaymentInputSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(["cash", "pix", "credit_card", "debit_card"]),
  cashTenderedCents: z.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  tabMemberId: z.string().uuid().nullable().optional(),
});

export type DiningTableInput = z.infer<typeof diningTableInputSchema>;
export type DiningRoundInput = z.infer<typeof diningRoundInputSchema>;
export type DiningMemberInput = z.infer<typeof diningMemberInputSchema>;
export type DiningPaymentInput = z.infer<typeof diningPaymentInputSchema>;
