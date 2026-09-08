import "server-only";

import { randomUUID } from "node:crypto";
import { IfoodAuthHttpClient } from "@/server/integrations/providers/ifood/ifood-auth-http-client";
import { IfoodAuthRepository } from "@/server/integrations/providers/ifood/ifood-auth-repository";
import { IfoodAuthService } from "@/server/integrations/providers/ifood/ifood-auth-service";
import { reconcileIfoodOrderLifecycle } from "@/server/integrations/providers/ifood/ifood-order-lifecycle-reconciler";
import { IfoodOrderScopeRepository } from "@/server/integrations/providers/ifood/ifood-order-scope-repository";
import { IfoodOrdersHttpClient } from "@/server/integrations/providers/ifood/ifood-orders-http-client";
import { runIfoodOrderIntakeCycle } from "@/server/integrations/providers/ifood/ifood-order-runtime";
import { CanonicalOrderImportService } from "@/server/integrations/runtime/canonical-order-import-service";
import { IntegrationRuntimeRepository } from "@/server/integrations/runtime/runtime-repository";

/** Server-only composition root for one complete iFood polling/intake cycle. */
export async function runConfiguredIfoodOrderIntake(input?: {
  workerId?: string;
  pollLimit?: number;
  processLimit?: number;
}) {
  const authService = new IfoodAuthService(
    new IfoodAuthRepository(),
    new IfoodAuthHttpClient(),
  );
  return runIfoodOrderIntakeCycle({
    scopeRepository: new IfoodOrderScopeRepository(),
    runtimeRepository: new IntegrationRuntimeRepository(),
    tokenProvider: authService,
    http: new IfoodOrdersHttpClient(),
    importOrder: (orderInput) => CanonicalOrderImportService.import(orderInput),
    reconcileLifecycle: async ({ event, externalOrderId, externalStatus, importResult }) => {
      await reconcileIfoodOrderLifecycle({
        organizationId: event.organization_id,
        storeId: event.store_id,
        orderId: importResult.order_id,
        integrationAccountId: event.integration_account_id,
        externalOrderId,
        externalEventId: event.external_event_id,
        eventType: event.event_type,
        externalStatus,
      });
    },
    workerId: input?.workerId ?? `ifood-order-intake:${randomUUID()}`,
    pollLimit: input?.pollLimit ?? 100,
    processLimit: input?.processLimit ?? 100,
  });
}
