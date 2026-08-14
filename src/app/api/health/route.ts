import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const runtime = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    appUrl: Boolean(process.env.APP_URL),
  };

  const configured = runtime.supabaseUrl && runtime.supabasePublishableKey;

  return NextResponse.json(
    {
      status: configured ? "ok" : "degraded",
      service: "pedeaqui",
      runtime,
      timestamp: new Date().toISOString(),
    },
    {
      status: configured ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
