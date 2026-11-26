import { z } from "zod";
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const eventItemsSchema = z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(1000000) })).min(1).max(100).refine(items => new Set(items.map(i => i.productId)).size === items.length, "Produto repetido");
export const eventCreateSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(2).max(120), startsLocal: localDate, endsLocal: localDate,
  closeStore: z.boolean(), closureReason: z.string().trim().max(300), closureStartsLocal: localDate.optional(), closureEndsLocal: localDate.optional(), items: eventItemsSchema,
}).refine(v => !v.closeStore || (v.closureReason.length >= 3 && v.closureStartsLocal && v.closureEndsLocal), "Informe o motivo e o período de fechamento");
export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type PdvEventStatus = "draft" | "active" | "closed" | "canceled";
export type PdvEvent = {
  id: string; name: string; startsAt: string; endsAt: string; status: PdvEventStatus; closeStore: boolean; closureReason: string | null;
  closureStartsAt: string | null; closureEndsAt: string | null;
  items: Array<{ productId: string; allocated: number; sold: number }>;
};
