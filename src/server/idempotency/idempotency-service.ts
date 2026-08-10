import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";

export type IdempotencyRecord = {
  id: string;
  status: "processing" | "completed" | "failed";
  requestFingerprint: string | null;
  responseCode: number | null;
  responseBody: unknown;
};

export type BeginIdempotencyResult =
  | { acquired: true; record: IdempotencyRecord }
  | { acquired: false; record: IdempotencyRecord };

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was reused with a different request");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyService {
  static async begin(
    context: AccessContext,
    input: {
      scope: string;
      key: string;
      requestFingerprint?: string | null;
      ttlSeconds?: number;
    },
  ): Promise<BeginIdempotencyResult> {
    const admin = createAdminClient();
    const ttlSeconds = input.ttlSeconds ?? 60 * 60 * 24;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const { data, error } = await admin
      .from("idempotency_keys")
      .insert({
        organization_id: context.organizationId,
        store_id: context.storeId,
        scope: input.scope,
        idempotency_key: input.key,
        request_fingerprint: input.requestFingerprint ?? null,
        status: "processing",
        expires_at: expiresAt,
      })
      .select("id, status, request_fingerprint, response_code, response_body")
      .single();

    if (!error && data) {
      return {
        acquired: true,
        record: normalize(data),
      };
    }

    if (error?.code !== "23505") throw error;

    const { data: existing, error: existingError } = await admin
      .from("idempotency_keys")
      .select("id, status, request_fingerprint, response_code, response_body")
      .eq("organization_id", context.organizationId)
      .eq("scope", input.scope)
      .eq("idempotency_key", input.key)
      .single();

    if (existingError) throw existingError;

    if (
      existing.request_fingerprint &&
      input.requestFingerprint &&
      existing.request_fingerprint !== input.requestFingerprint
    ) {
      throw new IdempotencyConflictError();
    }

    return { acquired: false, record: normalize(existing) };
  }

  static async complete(recordId: string, responseCode: number, responseBody: unknown) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("idempotency_keys")
      .update({
        status: "completed",
        response_code: responseCode,
        response_body: responseBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    if (error) throw error;
  }

  static async fail(recordId: string, responseCode = 500) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("idempotency_keys")
      .update({
        status: "failed",
        response_code: responseCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    if (error) throw error;
  }
}

function normalize(row: {
  id: string;
  status: string;
  request_fingerprint: string | null;
  response_code: number | null;
  response_body: unknown;
}): IdempotencyRecord {
  if (!['processing', 'completed', 'failed'].includes(row.status)) {
    throw new Error(`Unexpected idempotency status: ${row.status}`);
  }

  return {
    id: row.id,
    status: row.status as IdempotencyRecord["status"],
    requestFingerprint: row.request_fingerprint,
    responseCode: row.response_code,
    responseBody: row.response_body,
  };
}
