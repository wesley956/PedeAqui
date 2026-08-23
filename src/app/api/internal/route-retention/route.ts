import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return new Response("Unauthorized", { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cleanup_driver_route_points_internal", { p_now: new Date().toISOString() });
  if (error) throw error;
  return Response.json({ ok: true, sessionsDeleted: Number(data ?? 0) });
}
