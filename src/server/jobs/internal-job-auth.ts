import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type InternalJobKey = "campaign_messages" | "route_retention" | "payment_reconciliation";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function authorizeInternalJob(request: Request, jobKey: InternalJobKey) {
  const token = bearerToken(request);
  if (!token) return false;

  const transitionSecret = process.env.CRON_SECRET?.trim();
  if (transitionSecret && token === transitionSecret) return true;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("authorize_internal_job_internal", {
    p_job_key: jobKey,
    p_token: token,
  });
  return !error && data === true;
}
