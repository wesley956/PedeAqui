import { z } from "zod";

export const PRODUCT_EXPERIENCE_SCHEMA_VERSION = 1 as const;

export const productExperienceEventName = z.enum([
  "px.order.action",
  "px.realtime.connection",
  "px.operation.pause",
  "px.onboarding.step",
  "px.checkout.step",
  "px.print.recovery",
]);

export const productExperienceOutcome = z.enum([
  "success", "failure", "abandoned", "recovered", "unknown",
]);

export type ProductExperienceEventName = z.infer<typeof productExperienceEventName>;
export type ProductExperienceOutcome = z.infer<typeof productExperienceOutcome>;

const allowedMetadataKeys: Record<ProductExperienceEventName, ReadonlySet<string>> = {
  "px.order.action": new Set(["action", "surface", "workflow_mode", "result"]),
  "px.realtime.connection": new Set(["surface", "state", "previous_state", "transport"]),
  "px.operation.pause": new Set(["action", "reason_category"]),
  "px.onboarding.step": new Set(["step", "action"]),
  "px.checkout.step": new Set(["step", "action", "fulfillment_type"]),
  "px.print.recovery": new Set(["action", "job_status", "attempt_bucket"]),
};

export function safeProductMetadata(
  eventName: ProductExperienceEventName,
  input: Record<string, unknown> | undefined,
) {
  const output: Record<string, string | number | boolean | null> = {};
  const allowed = allowedMetadataKeys[eventName];
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!allowed.has(key)) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = typeof value === "string" ? value.slice(0, 120) : value;
    }
  }
  return output;
}

export const productExperienceClientEvent = z.object({
  eventName: productExperienceEventName,
  sessionId: z.string().uuid().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  outcome: productExperienceOutcome.nullable().optional(),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});
