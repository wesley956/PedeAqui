import { z } from "zod";

const optionalInteger = z.number().int().nonnegative().optional();

export const growthSettingsSchema = z.object({
  cashbackEnabled: z.boolean(),
  cashbackRateBps: z.number().int().min(0).max(10000),
  cashbackMinOrderCents: z.number().int().nonnegative(),
  cashbackExpiryDays: z.number().int().min(1).max(3650).nullable(),
  loyaltyEnabled: z.boolean(),
  loyaltySpendCentsPerPoint: z.number().int().positive(),
  loyaltyRedeemCentsPerPoint: z.number().int().positive(),
});

export const couponInputSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  discountType: z.enum(["fixed", "percentage"]),
  fixedDiscountCents: z.number().int().positive().nullable(),
  percentageBps: z.number().int().min(1).max(10000).nullable(),
  maxDiscountCents: z.number().int().positive().nullable(),
  minimumOrderCents: z.number().int().nonnegative(),
  usageLimitTotal: z.number().int().positive().nullable(),
  usageLimitPerCustomer: z.number().int().positive().nullable(),
  validUntil: z.string().datetime().nullable(),
}).superRefine((value, ctx) => {
  if (value.discountType === "fixed" && value.fixedDiscountCents === null) ctx.addIssue({ code: "custom", message: "Informe o desconto fixo." });
  if (value.discountType === "percentage" && value.percentageBps === null) ctx.addIssue({ code: "custom", message: "Informe o percentual." });
});

export const segmentInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable(),
  ordersCountMin: optionalInteger,
  totalSpentCentsMin: optionalInteger,
  averageTicketCentsMin: optionalInteger,
  inactiveDaysMin: z.number().int().positive().optional(),
  lastOrderDaysMax: z.number().int().positive().optional(),
  hasCashbackBalance: z.boolean().optional(),
  hasLoyaltyBalance: z.boolean().optional(),
});

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(140),
  objective: z.string().trim().max(240).nullable(),
  channel: z.enum(["internal", "whatsapp", "email"]),
  content: z.string().trim().max(4000),
  segmentId: z.string().uuid().nullable(),
});

export const automationInputSchema = z.object({
  name: z.string().trim().min(2).max(140),
  triggerType: z.enum(["order.completed", "customer.inactive", "customer.birthday"]),
  actionType: z.enum(["campaign", "bonus_cashback", "bonus_points"]),
  minimumTotalCents: z.number().int().nonnegative().optional(),
  channel: z.string().trim().max(40).optional(),
  inactiveDays: z.number().int().positive().optional(),
  campaignId: z.string().uuid().nullable(),
  bonusCashbackCents: z.number().int().positive().optional(),
  bonusPoints: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (value.actionType === "campaign" && !value.campaignId) ctx.addIssue({ code: "custom", message: "Selecione a campanha da automação." });
  if (value.actionType === "bonus_cashback" && !value.bonusCashbackCents) ctx.addIssue({ code: "custom", message: "Informe o cashback bônus." });
  if (value.actionType === "bonus_points" && !value.bonusPoints) ctx.addIssue({ code: "custom", message: "Informe os pontos bônus." });
});

export const cartBenefitsSchema = z.object({
  couponCode: z.string().trim().max(40).nullable(),
  cashbackRedeemCents: z.number().int().nonnegative(),
  loyaltyRedeemPoints: z.number().int().nonnegative(),
});

export type GrowthSettingsInput = z.infer<typeof growthSettingsSchema>;
export type CouponInput = z.infer<typeof couponInputSchema>;
export type SegmentInput = z.infer<typeof segmentInputSchema>;
export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type AutomationInput = z.infer<typeof automationInputSchema>;
export type CartBenefitsInput = z.infer<typeof cartBenefitsSchema>;
