import "server-only";

import { randomUUID } from "node:crypto";
import { IfoodAuthHttpClient } from "@/server/integrations/providers/ifood/ifood-auth-http-client";
import { IfoodAuthRepository } from "@/server/integrations/providers/ifood/ifood-auth-repository";
import { IfoodAuthService } from "@/server/integrations/providers/ifood/ifood-auth-service";
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
    workerId: input?.workerId ?? `ifood-order-intake:${randomUUID()}`,
    pollLimit: input?.pollLimit ?? 100,
    processLimit: input?.processLimit ?? 100,
  });
}
