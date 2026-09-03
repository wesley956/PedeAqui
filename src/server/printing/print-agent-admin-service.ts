import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { derivePrintAgentToken, hashPrintAgentToken } from "@/server/printing/agent-token";

const intentKey = z.string().trim().min(8).max(240);
const createCredentialResult = z.object({
  id: z.string().uuid(),
  name: z.string(),
  credential_version: z.number().int().min(1),
  created: z.boolean(),
  replayed: z.boolean(),
});
const reconnectCredentialResult = z.object({
  id: z.string().uuid(),
  name: z.string(),
  credential_version: z.number().int().min(1),
  rotated: z.boolean(),
  replayed: z.boolean(),
});

function credentialSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Print Agent credential secret is not configured");
  return secret;
}

export class PrintAgentAdminService {
  static async create(name: string, key: string) {
    const safeName = z.string().trim().min(2).max(100).parse(name);
    const safeKey = intentKey.parse(key);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const secret = credentialSecret();
    const proposedAgentId = randomUUID();
    const proposedToken = derivePrintAgentToken(proposedAgentId, safeKey, secret);
    const { data, error } = await admin.rpc("print_agent_create_idempotent_internal", {
      p_agent_id: proposedAgentId,
      p_store_id: context.storeId,
      p_name: safeName,
      p_token_hash: hashPrintAgentToken(proposedToken),
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    const result = createCredentialResult.parse(data);
    const token = result.id === proposedAgentId
      ? proposedToken
      : derivePrintAgentToken(result.id, safeKey, secret);
    if (result.created && !result.replayed) {
      await AuditService.record(context, {
        action: "print.agent_created",
        entityType: "print_agent",
        entityId: result.id,
        after: { id: result.id, name: result.name, credentialVersion: result.credential_version },
      });
    }
    return { id: result.id, name: result.name, token };
  }

  static async reconnect(agentId: string, key: string) {
    const id = z.string().uuid().parse(agentId);
    const safeKey = intentKey.parse(key);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const secret = credentialSecret();
    const { data: current, error: readError } = await admin.from("print_agents")
      .select("id, name, active, version, credential_version")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Computador de impressão não encontrado nesta unidade");

    const token = derivePrintAgentToken(current.id, safeKey, secret);
    const { data, error } = await admin.rpc("print_agent_reconnect_idempotent_internal", {
      p_agent_id: current.id,
      p_token_hash: hashPrintAgentToken(token),
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    const result = reconnectCredentialResult.parse(data);

    if (result.rotated && !result.replayed) {
      await AuditService.record(context, {
        action: "print.agent_reconnected",
        entityType: "print_agent",
        entityId: result.id,
        before: { active: current.active, version: current.version, credentialVersion: Number(current.credential_version ?? 0) },
        after: { active: true, credentialRotated: true, credentialVersion: result.credential_version },
      });
    }
    return { id: result.id, name: result.name, token };
  }
}
