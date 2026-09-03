import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { derivePrintAgentToken, hashPrintAgentToken } from "@/server/printing/agent-token";

const credentialResult = z.object({
  id: z.string().uuid(),
  name: z.string(),
  credential_version: z.number().int().min(1),
  created: z.boolean(),
});
const CREDENTIAL_REPLAY_WINDOW_MS = 15 * 60_000;

function credentialSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Print Agent credential secret is not configured");
  return secret;
}

function isRecentRotation(rotatedAt: string | null | undefined) {
  if (!rotatedAt) return false;
  const timestamp = Date.parse(rotatedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp <= CREDENTIAL_REPLAY_WINDOW_MS;
}

export class PrintAgentAdminService {
  static async create(name: string) {
    const safeName = z.string().trim().min(2).max(100).parse(name);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const secret = credentialSecret();
    const proposedAgentId = randomUUID();
    const proposedVersion = 1;
    const proposedToken = derivePrintAgentToken(proposedAgentId, proposedVersion, secret);
    const { data, error } = await admin.rpc("print_agent_create_idempotent_internal", {
      p_agent_id: proposedAgentId,
      p_store_id: context.storeId,
      p_name: safeName,
      p_token_hash: hashPrintAgentToken(proposedToken),
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    const result = credentialResult.parse(data);
    const token = result.id === proposedAgentId && result.credential_version === proposedVersion
      ? proposedToken
      : derivePrintAgentToken(result.id, result.credential_version, secret);
    if (result.created) {
      await AuditService.record(context, {
        action: "print.agent_created",
        entityType: "print_agent",
        entityId: result.id,
        after: { id: result.id, name: result.name },
      });
    }
    return { id: result.id, name: result.name, token };
  }

  static async reconnect(agentId: string) {
    const id = z.string().uuid().parse(agentId);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const secret = credentialSecret();
    const { data: current, error: readError } = await admin.from("print_agents")
      .select("id, name, active, version, token_hash, credential_version, credential_rotated_at, credential_rotated_by")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new Error("Computador de impressão não encontrado nesta unidade");

    const currentCredentialVersion = Number(current.credential_version ?? 0);
    if (
      currentCredentialVersion > 0
      && current.credential_rotated_by === context.userId
      && isRecentRotation(current.credential_rotated_at)
    ) {
      const replayToken = derivePrintAgentToken(current.id, currentCredentialVersion, secret);
      if (hashPrintAgentToken(replayToken) === current.token_hash) {
        return { id: current.id, name: current.name, token: replayToken };
      }
    }

    const nextVersion = currentCredentialVersion + 1;
    const token = derivePrintAgentToken(current.id, nextVersion, secret);
    const now = new Date().toISOString();
    const { data, error } = await admin.from("print_agents")
      .update({
        token_hash: hashPrintAgentToken(token),
        credential_version: nextVersion,
        credential_rotated_at: now,
        credential_rotated_by: context.userId,
        active: true,
        status: "unknown",
        last_error: null,
        updated_at: now,
      })
      .eq("id", current.id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("credential_version", currentCredentialVersion)
      .select("id, name")
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const { data: replay, error: replayError } = await admin.from("print_agents")
        .select("id, name, token_hash, credential_version, credential_rotated_at, credential_rotated_by")
        .eq("id", current.id)
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .maybeSingle();
      if (replayError) throw replayError;
      if (
        replay
        && Number(replay.credential_version) > 0
        && replay.credential_rotated_by === context.userId
        && isRecentRotation(replay.credential_rotated_at)
      ) {
        const replayToken = derivePrintAgentToken(replay.id, Number(replay.credential_version), secret);
        if (hashPrintAgentToken(replayToken) === replay.token_hash) {
          return { id: replay.id, name: replay.name, token: replayToken };
        }
      }
      throw new Error("A credencial mudou durante a reconexão. Tente novamente.");
    }

    await AuditService.record(context, {
      action: "print.agent_reconnected",
      entityType: "print_agent",
      entityId: data.id,
      before: { active: current.active, version: current.version, credentialVersion: currentCredentialVersion },
      after: { active: true, credentialRotated: true, credentialVersion: nextVersion },
    });
    return { id: data.id, name: data.name, token };
  }
}
