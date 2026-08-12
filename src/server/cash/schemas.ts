import { z } from "zod";

export const cashRegisterInputSchema = z.object({
  code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  name: z.string().trim().min(1).max(80),
});

export const cashRegisterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
});

export const cashOpenSessionSchema = z.object({
  cashRegisterId: z.string().uuid(),
  openingBalanceCents: z.number().int().nonnegative(),
  note: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(240),
});

export const cashManualMovementSchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum(["supply", "withdrawal"]),
  amountCents: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(240),
});

export const cashCloseSessionSchema = z.object({
  sessionId: z.string().uuid(),
  countedCashCents: z.number().int().nonnegative(),
  note: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(240),
});

export type CashRegisterInput = z.infer<typeof cashRegisterInputSchema>;
export type CashRegisterUpdateInput = z.infer<typeof cashRegisterUpdateSchema>;
export type CashOpenSessionInput = z.infer<typeof cashOpenSessionSchema>;
export type CashManualMovementInput = z.infer<typeof cashManualMovementSchema>;
export type CashCloseSessionInput = z.infer<typeof cashCloseSessionSchema>;
