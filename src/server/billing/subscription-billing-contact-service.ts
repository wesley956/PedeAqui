import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

function usableEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email || email.endsWith("@auth.pedeaqui.invalid")) return null;
  return email;
}

export class SubscriptionBillingContactService {
  static async syncMissingOrganizationEmails() {
    const admin = createAdminClient();
    const result = { scanned: 0, updated: 0, skipped: 0, errors: [] as string[] };

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("organization_subscriptions")
      .select("organization_id")
      .in("status", ["active", "past_due"])
      .in("billing_interval", ["month", "year"]);
    if (subscriptionsError) throw subscriptionsError;

    const organizationIds = [...new Set((subscriptions ?? []).map((row) => row.organization_id))];
    result.scanned = organizationIds.length;
    if (organizationIds.length === 0) return result;

    const [{ data: organizations, error: organizationsError }, { data: ownerRole, error: ownerRoleError }] = await Promise.all([
      admin.from("organizations").select("id,email").in("id", organizationIds),
      admin.from("roles").select("id").eq("key", "owner").limit(1).maybeSingle(),
    ]);
    if (organizationsError) throw organizationsError;
    if (ownerRoleError) throw ownerRoleError;
    if (!ownerRole?.id) throw new Error("Owner role unavailable for subscription billing contact sync");

    for (const organization of organizations ?? []) {
      if (usableEmail(organization.email)) {
        result.skipped += 1;
        continue;
      }

      try {
        const { data: membership, error: membershipError } = await admin
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", organization.id)
          .eq("role_id", ownerRole.id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership?.user_id) {
          result.skipped += 1;
          continue;
        }

        const { data: userData, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
        if (userError) throw userError;
        const email = usableEmail(userData.user?.email);
        if (!email) {
          result.skipped += 1;
          continue;
        }

        const current = await admin.from("organizations").select("email").eq("id", organization.id).single();
        if (current.error) throw current.error;
        if (usableEmail(current.data.email)) {
          result.skipped += 1;
          continue;
        }

        const update = await admin.from("organizations").update({ email, updated_at: new Date().toISOString() }).eq("id", organization.id);
        if (update.error) throw update.error;
        result.updated += 1;
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message.slice(0, 180) : "Unknown billing contact sync error");
      }
    }

    return result;
  }
}
