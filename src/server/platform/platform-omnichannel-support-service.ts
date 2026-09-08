import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import { PlatformOmnichannelHealthService } from "@/server/platform/platform-omnichannel-health-service";
import { IntegrationRuntimeRepository } from "@/server/integrations/runtime/runtime-repository";
import { reconcileIfoodOrderLifecycle } from "@/server/integrations/providers/ifood/ifood-order-lifecycle-reconciler";

function correlationId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

export class PlatformOmnichannelSupportService {
  static async loadQueue() {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const [events, outbox, divergent] = await Promise.all([
      admin.from("integration_events")
        .select("id,organization_id,store_id,integration_account_id,provider,capability,external_event_id,event_type,status,attempts,received_at,last_error_kind")
        .in("status", ["retry", "dead_letter"])
        .order("received_at", { ascending: false })
        .limit(100),
      admin.from("integration_outbox")
        .select("id,organization_id,store_id,integration_account_id,order_id,provider,capability,operation,status,attempts,created_at,last_error_kind")
        .in("status", ["retry", "dead_letter"])
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("external_orders")
        .select("id,organization_id,store_id,order_id,integration_account_id,provider,external_order_id,external_status,sync_status,last_external_event_id,updated_at")
        .in("sync_status", ["retry", "attention"])
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);
    for (const result of [events, outbox, divergent]) if (result.error) throw result.error;
    return {
      events: events.data ?? [],
      outbox: outbox.data ?? [],
      divergent: divergent.data ?? [],
    };
  }

  static async refreshHealth() {
    await PlatformAdminService.access();
    return PlatformOmnichannelHealthService.syncIncidents();
  }

  static async reprocessEvent(eventId: string) {
    const { user } = await PlatformAdminService.access();
    const repo = new IntegrationRuntimeRepository();
    const ok = await repo.reprocessEvent({
      eventId,
      actorUserId: user.id,
      correlationId: correlationId("support-event"),
    });
    if (!ok) throw new Error("Evento não está em estado seguro para reprocessamento.");
    return { ok: true } as const;
  }

  static async retryOutbox(outboxId: string) {
    const { user } = await PlatformAdminService.access();
    const repo = new IntegrationRuntimeRepository();
    const ok = await repo.reprocessOutbox({
      outboxId,
      actorUserId: user.id,
      correlationId: correlationId("support-outbox"),
    });
    if (!ok) throw new Error("Comando não está em retry/dead-letter ou já foi recuperado.");
    return { ok: true } as const;
  }

  static async reconcileOrder(externalOrderRowId: string) {
    const { user } = await PlatformAdminService.access();
    const admin = createAdminClient();
    const relation = await admin.from("external_orders")
      .select("id,organization_id,store_id,order_id,integration_account_id,provider,external_order_id,external_status,last_external_event_id")
      .eq("id", externalOrderRowId)
      .single();
    if (relation.error) throw relation.error;
    if (relation.data.provider !== "ifood") {
      throw new Error("Reconciliação manual ainda não está disponível para este provider; não será forçado nenhum status.");
    }
    const result = await reconcileIfoodOrderLifecycle({
      organizationId: String(relation.data.organization_id),
      storeId: String(relation.data.store_id),
      orderId: String(relation.data.order_id),
      integrationAccountId: String(relation.data.integration_account_id),
      externalOrderId: String(relation.data.external_order_id),
      externalEventId: typeof relation.data.last_external_event_id === "string" ? relation.data.last_external_event_id : null,
      externalStatus: typeof relation.data.external_status === "string" ? relation.data.external_status : null,
    });
    if (!result.milestone) {
      throw new Error("O último estado conhecido do provider não possui marco operacional seguro para reaplicar.");
    }
    const audit = await admin.from("integration_audit_log").insert({
      organization_id: relation.data.organization_id,
      store_id: relation.data.store_id,
      integration_account_id: relation.data.integration_account_id,
      actor_user_id: user.id,
      provider: relation.data.provider,
      capability: "ifood_orders",
      action: "order_reconciled_from_last_known_provider_state",
      source: "admin",
      correlation_id: correlationId("support-reconcile"),
      metadata: {
        external_order_row_id: relation.data.id,
        order_id: relation.data.order_id,
        milestone: result.milestone,
      },
    });
    if (audit.error) throw audit.error;
    return { ok: true, milestone: result.milestone } as const;
  }
}
