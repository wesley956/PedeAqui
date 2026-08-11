import { z } from "zod";

export const posPaymentMethodSchema = z.enum(["cash", "pix", "credit_card", "debit_card"]);

export const posSaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
  note: z.string().trim().max(500).optional().default(""),
  modifierIds: z.array(z.string().uuid()).max(40).superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Adicional duplicado" });
  }),
});

export const posPaymentLineSchema = z.object({
  method: posPaymentMethodSchema,
  amountCents: z.number().int().positive(),
  cashReceivedCents: z.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
}).superRefine((line, ctx) => {
  if (line.method === "cash" && line.cashReceivedCents !== null && line.cashReceivedCents !== undefined && line.cashReceivedCents < line.amountCents) {
    ctx.addIssue({ code: "custom", path: ["cashReceivedCents"], message: "Valor recebido deve cobrir a parcela em dinheiro" });
  }
  if (line.method !== "cash" && line.cashReceivedCents !== null && line.cashReceivedCents !== undefined) {
    ctx.addIssue({ code: "custom", path: ["cashReceivedCents"], message: "Valor recebido só se aplica a dinheiro" });
  }
});

export const posCustomerSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
}).superRefine((customer, ctx) => {
  if (!customer.id && customer.phone?.trim() && !customer.name?.trim()) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "Informe o nome para cadastrar um novo cliente" });
  }
});

export const posSaleSchema = z.object({
  items: z.array(posSaleItemSchema).min(1).max(100),
  payments: z.array(posPaymentLineSchema).min(1).max(10),
  customer: posCustomerSchema.nullable().optional(),
});

export type PosSaleInput = z.infer<typeof posSaleSchema>;
