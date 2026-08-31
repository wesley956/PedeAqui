import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 86_400_000;

export type SubscriptionAccessState =
  | "legacy"
  | "trial"
  | "active"
  | "grace"
  | "payment_required"
  | "suspended"
  | "ended";

export type SubscriptionAccessDecision = {
  state: SubscriptionAccessState;
  operationalAccess: boolean;
  hasSubscription: boolean;
  subscriptionId: string | null;
  status: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  nextDueAt: string | null;
  accessSuspendedAt: string | null;
  remainingTrialDays: number | null;
  remainingGraceDays: number | null;
};

function remainingDays(target: string | null, nowMs: number) {
  if (!target) return null;
  return Math.max(0, Math.ceil((new Date(target).getTime() - nowMs) / DAY_MS));
}

function fallbackGraceEnd(base: string | null, days: number) {
  if (!base) return null;
  return new Date(new Date(base).getTime() + days * DAY_MS).toISOString();
}

export class SubscriptionLifecycleService {
  static async systemActor() {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("active", true)
      .eq("role", "super_admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.user_id) throw new Error("No active platform super_admin available for subscription lifecycle audit");
    return data.user_id;
  }

  static async reconcile(now = new Date()) {
    const admin = createAdminClient();
    const actorUserId = await this.systemActor();
    const { data, error } = await admin.rpc("subscription_lifecycle_reconcile_internal", {
      p_actor_user_id: actorUserId,
      p_at: now.toISOString(),
    });
    if (error) throw error;
    return data;
  }

  static async accessForOrganization(organizationId: string, now = new Date()): Promise<SubscriptionAccessDecision> {
    const admin = createAdminClient();
    const { data: subscription, error } = await admin
      .from("organization_subscriptions")
      .select("id,status,trial_ends_at,grace_ends_at,next_due_at,payment_status,grace_period_days,access_suspended_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!subscription) {
      return {
        state: "legacy",
        operationalAccess: true,
        hasSubscription: false,
        subscriptionId: null,
        status: null,
        trialEndsAt: null,
        graceEndsAt: null,
        nextDueAt: null,
        accessSuspendedAt: null,
        remainingTrialDays: null,
        remainingGraceDays: null,
      };
    }

    const nowMs = now.getTime();
    const graceDays = Number(subscription.grace_period_days) || 3;
    const trialEndsAt = subscription.trial_ends_at;
    const nextDueAt = subscription.next_due_at;
    const derivedGrace = subscription.grace_ends_at
      ?? (subscription.status === "trialing" ? fallbackGraceEnd(trialEndsAt, graceDays) : fallbackGraceEnd(nextDueAt, graceDays));
    const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : null;
    const dueMs = nextDueAt ? new Date(nextDueAt).getTime() : null;
    const graceMs = derivedGrace ? new Date(derivedGrace).getTime() : null;
    const paid = subscription.payment_status === "paid" || subscription.payment_status === "waived";

    let state: SubscriptionAccessState;
    let operationalAccess: boolean;

    if (subscription.access_suspended_at) {
      state = "suspended";
      operationalAccess = false;
    } else if (subscription.status === "cancelled" || subscription.status === "expired") {
      state = "ended";
      operationalAccess = false;
    } else if (subscription.status === "trialing") {
      if (trialEndMs === null || trialEndMs > nowMs || paid) {
        state = "trial";
        operationalAccess = true;
      } else if (graceMs !== null && graceMs > nowMs) {
        state = "grace";
        operationalAccess = true;
      } else {
        state = "payment_required";
        operationalAccess = false;
      }
    } else if (subscription.status === "past_due") {
      if (paid) {
        state = "active";
        operationalAccess = true;
      } else if (graceMs !== null && graceMs > nowMs) {
        state = "grace";
        operationalAccess = true;
      } else {
        state = "payment_required";
        operationalAccess = false;
      }
    } else if (subscription.status === "active") {
      if (!paid && dueMs !== null && dueMs <= nowMs) {
        if (graceMs !== null && graceMs > nowMs) {
          state = "grace";
          operationalAccess = true;
        } else {
          state = "payment_required";
          operationalAccess = false;
        }
      } else {
        state = "active";
        operationalAccess = true;
      }
    } else {
      state = "payment_required";
      operationalAccess = false;
    }

    return {
      state,
      operationalAccess,
      hasSubscription: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      trialEndsAt,
      graceEndsAt: derivedGrace,
      nextDueAt,
      accessSuspendedAt: subscription.access_suspended_at,
      remainingTrialDays: state === "trial" ? remainingDays(trialEndsAt, nowMs) : null,
      remainingGraceDays: state === "grace" ? remainingDays(derivedGrace, nowMs) : null,
    };
  }
}
