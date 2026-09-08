import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import type { SalesChannelOrderCommand } from "@/server/integrations/core/contracts";
import {
  IntegrationConfigurationError,
  IntegrationProviderError,
} from "@/server/integrations/core/errors";
import { IfoodAuthHttpClient, IfoodHttpError } from "@/server/integrations/providers/ifood/ifood-auth-http-client";
import { IfoodAuthRepository } from "@/server/integrations/providers/ifood/ifood-auth-repository";
import { IfoodAuthService } from "@/server/integrations/providers/ifood/ifood-auth-service";
import {
  IfoodOrdersHttpClient,
  type IfoodOrderCancellationReason,
} from "@/server/integrations/providers/ifood/ifood-orders-http-client";
import { IntegrationRuntimeRepository } from "@/server/integrations/runtime/runtime-repository";

const uuidSchema = z.string().uuid();

export type IfoodLifecycleCommand = Extract<
  SalesChannelOrderCommand,
  "confirm" | "start_preparation" | "mark_ready" | "request_cancellation"
>;

type ExternalOrderTarget = {
  externalOrderLinkId: string;
  organizationId: string;
  storeId: string;
  integrationAccountId: string;
  externalOrderId: string;
  externalMerchantId: string;
};

function requireStoreId(storeId: string | null): string {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

function capabilityEnabled(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Record<string, unknown>).ifood_orders === true,
  );
}

function accountOperational(row: { status?: unknown; connection_state?: unknown }): boolean {
  return (row.status === "connected" || row.status === "attention")
    && row.connection_state === "connected";
}

function providerFailure(error: unknown): never {
  if (error instanceof IfoodHttpError) {
    throw new IntegrationProviderError(
      error.message,
      error.code ?? `ifood_http_${error.status}`,
      error.retryable,
      { cause: error },
    );
  }
  throw error;
}

/**
 * Routes panel lifecycle actions for iFood orders into the durable integration
 * outbox. It deliberately does not mutate the canonical order; provider events
 * remain the source of truth for confirmation of each transition.
 */
export class IfoodOrderLifecycleService {
  private static async targetForOrder(
    orderId: string,
    permission: typeof PERMISSIONS.ORDERS_EDIT | typeof PERMISSIONS.ORDERS_CANCEL,
  ): Promise<{ target: ExternalOrderTarget; actorUserId: string } | null> {
    const id = uuidSchema.parse(orderId);
    const context = await authorize(permission);
    const storeId = requireStoreId(context.storeId);
    const db = createAdminClient();

    const external = await db
      .from("external_orders")
      .select("id,provider,integration_account_id,integration_merchant_id,external_order_id")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("order_id", id)
      .maybeSingle();
    if (external.error) throw external.error;
    if (!external.data) return null;
    if (external.data.provider !== "ifood") {
      throw new IntegrationConfigurationError(
        "Este pedido externo ainda não possui comandos operacionais habilitados no PedeAqui.",
        "external_order_commands_not_enabled",
      );
    }
    if (!external.data.integration_merchant_id) {
      throw new IntegrationConfigurationError(
        "O vínculo da loja iFood deste pedido não está disponível.",
        "ifood_order_merchant_binding_missing",
      );
    }

    const merchant = await db
      .from("integration_merchants")
      .select("external_merchant_id,environment,capabilities")
      .eq("id", external.data.integration_merchant_id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("integration_account_id", external.data.integration_account_id)
      .eq("provider", "ifood")
      .maybeSingle();
    if (merchant.error) throw merchant.error;
    if (!merchant.data || !capabilityEnabled(merchant.data.capabilities)) {
      throw new IntegrationConfigurationError(
        "A integração de pedidos do iFood não está habilitada para esta loja.",
        "ifood_orders_capability_disabled",
      );
    }

    const account = await db
      .from("integration_accounts")
      .select("status,connection_state,environment")
      .eq("id", external.data.integration_account_id)
      .eq("organization_id", context.organizationId)
      .eq("provider", "ifood")
      .maybeSingle();
    if (account.error) throw account.error;
    if (!account.data || !accountOperational(account.data)) {
      throw new IntegrationConfigurationError(
        "A conexão com o iFood precisa ser restabelecida antes desta ação.",
        "ifood_order_account_not_operational",
      );
    }
    if (String(account.data.environment) !== String(merchant.data.environment)) {
      throw new IntegrationConfigurationError(
        "A conta e a loja iFood estão vinculadas a ambientes diferentes.",
        "ifood_order_environment_mismatch",
      );
    }

    return {
      actorUserId: context.userId,
      target: {
        externalOrderLinkId: String(external.data.id),
        organizationId: context.organizationId,
        storeId,
        integrationAccountId: String(external.data.integration_account_id),
        externalOrderId: String(external.data.external_order_id),
        externalMerchantId: String(merchant.data.external_merchant_id),
      },
    };
  }

  static async enqueueIfExternal(input: {
    orderId: string;
    command: IfoodLifecycleCommand;
    cancellationReason?: string | null;
    afterConfirmation?: "start_preparation" | null;
  }): Promise<{ queued: true; duplicate: boolean; outboxId: string; command: IfoodLifecycleCommand } | null> {
    const permission = input.command === "request_cancellation"
      ? PERMISSIONS.ORDERS_CANCEL
      : PERMISSIONS.ORDERS_EDIT;
    const resolved = await this.targetForOrder(input.orderId, permission);
    if (!resolved) return null;

    const cancellationReason = input.cancellationReason?.trim() || null;
    if (input.command === "request_cancellation" && !cancellationReason) {
      throw new IntegrationConfigurationError(
        "Selecione um motivo de cancelamento aceito pelo iFood.",
        "ifood_cancellation_reason_missing",
      );
    }
    if (input.afterConfirmation && input.command !== "confirm") {
      throw new IntegrationConfigurationError(
        "A ação encadeada do iFood só pode ser usada após uma confirmação.",
        "ifood_after_confirmation_invalid",
      );
    }

    const idempotencyKey = [
      "ifood-order",
      input.orderId,
      input.command,
      cancellationReason ?? "-",
    ].join(":");
    const runtime = new IntegrationRuntimeRepository();
    const payload = {
      externalOrderId: resolved.target.externalOrderId,
      externalMerchantId: resolved.target.externalMerchantId,
      ...(cancellationReason ? { reason: cancellationReason } : {}),
      ...(input.afterConfirmation ? { afterConfirmation: input.afterConfirmation } : {}),
    };
    const queued = await runtime.enqueueOutbox({
      organizationId: resolved.target.organizationId,
      storeId: resolved.target.storeId,
      orderId: input.orderId,
      integrationAccountId: resolved.target.integrationAccountId,
      provider: "ifood",
      capability: "ifood_orders",
      operation: input.command,
      idempotencyKey,
      payload,
    });

    const db = createAdminClient();
    if (queued.duplicate && input.afterConfirmation) {
      // Upgrade an already queued confirmation without sending a duplicate
      // provider command. The follow-up remains gated by the confirmation event.
      const upgrade = await db
        .from("integration_outbox")
        .update({ payload })
        .eq("id", queued.id)
        .eq("integration_account_id", resolved.target.integrationAccountId)
        .in("status", ["pending", "processing", "sent", "retry"]);
      if (upgrade.error) throw upgrade.error;
    }

    const sync = await db
      .from("external_orders")
      .update({ sync_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", resolved.target.externalOrderLinkId)
      .eq("organization_id", resolved.target.organizationId)
      .eq("store_id", resolved.target.storeId);
    if (sync.error) throw sync.error;

    const audit = await db.from("integration_audit_log").insert({
      organization_id: resolved.target.organizationId,
      store_id: resolved.target.storeId,
      integration_account_id: resolved.target.integrationAccountId,
      actor_user_id: resolved.actorUserId,
      provider: "ifood",
      capability: "ifood_orders",
      action: queued.duplicate ? "order_command_deduplicated" : "order_command_queued",
      source: "user_action",
      correlation_id: queued.id,
      metadata: {
        order_id: input.orderId,
        external_order_id: resolved.target.externalOrderId,
        command: input.command,
        ...(input.afterConfirmation ? { after_confirmation: input.afterConfirmation } : {}),
      },
    });
    if (audit.error) throw audit.error;

    return { queued: true, duplicate: queued.duplicate, outboxId: queued.id, command: input.command };
  }

  static async cancellationReasonsIfExternal(orderId: string): Promise<IfoodOrderCancellationReason[] | null> {
    const resolved = await this.targetForOrder(orderId, PERMISSIONS.ORDERS_CANCEL);
    if (!resolved) return null;

    const auth = new IfoodAuthService(
      new IfoodAuthRepository(),
      new IfoodAuthHttpClient(),
    );
    const http = new IfoodOrdersHttpClient();
    try {
      const accessToken = await auth.validAccessToken(
        resolved.target.organizationId,
        resolved.target.integrationAccountId,
      );
      return await http.getCancellationReasons({
        accessToken,
        orderId: resolved.target.externalOrderId,
      });
    } catch (error) {
      providerFailure(error);
    }
  }
}
