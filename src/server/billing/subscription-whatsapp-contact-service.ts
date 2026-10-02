import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { billingWhatsAppContactSchema } from "@/server/billing/subscription-whatsapp-contract";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  contact: billingWhatsAppContactSchema,
});

export class SubscriptionWhatsAppContactService {
  static async save(input: z.infer<typeof inputSchema>) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const parsed = inputSchema.parse(input);
    const admin = createAdminClient();
    const existing = await admin.from("organization_subscriptions").select("metadata,updated_at")
      .eq("organization_id", parsed.organizationId).eq("id", parsed.subscriptionId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data || existing.data.updated_at !== parsed.expectedUpdatedAt) throw new Error("billing_contact_conflict");
    const metadata = existing.data.metadata && typeof existing.data.metadata === "object" && !Array.isArray(existing.data.metadata)
      ? existing.data.metadata as Record<string, unknown> : {};
    const now = new Date().toISOString();
    const updated = await admin.from("organization_subscriptions").update({
      metadata: { ...metadata, billing_whatsapp_contact: { ...parsed.contact, updatedBy: access.user.id, updatedAt: now } },
      updated_at: now,
    }).eq("organization_id", parsed.organizationId).eq("id", parsed.subscriptionId)
      .eq("updated_at", parsed.expectedUpdatedAt).select("id").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("billing_contact_conflict");
  }
}
