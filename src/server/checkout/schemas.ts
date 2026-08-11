import { z } from "zod";

export const fulfillmentTypeSchema = z.enum(["delivery", "pickup"]);
export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;

export const paymentMethodSchema = z.enum(["cash", "pix", "credit_card", "debit_card"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
};

export const checkoutIdentitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(32),
  email: z.union([z.string().trim().email(), z.literal("")]).nullable().optional()
    .transform((value) => value || null),
});
export type CheckoutIdentityInput = z.infer<typeof checkoutIdentitySchema>;

export const checkoutAddressSchema = z.object({
  postalCode: z.string().trim().min(8).max(12),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(30),
  complement: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  reference: z.string().trim().max(240).nullable().optional(),
});
export type CheckoutAddressInput = z.infer<typeof checkoutAddressSchema>;

export const checkoutPaymentSchema = z.object({
  method: paymentMethodSchema,
  cashChangeForCents: z.number().int().nonnegative().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.method !== "cash" && value.cashChangeForCents !== null && value.cashChangeForCents !== undefined) {
    ctx.addIssue({ code: "custom", message: "Troco só pode ser informado para pagamento em dinheiro" });
  }
});
export type CheckoutPaymentInput = z.infer<typeof checkoutPaymentSchema>;
