import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { printLineSpacingSchema } from "@/server/printing/print-line-spacing-service";

const inputSchema = z.object({ jobId: z.string().uuid() });

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid job" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("print_jobs")
    .select("line_spacing")
    .eq("id", input.data.jobId)
    .eq("organization_id", agent.organization_id)
    .eq("store_id", agent.store_id)
    .eq("claimed_by_agent_id", agent.id)
    .eq("status", "processing")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "style lookup failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "job unavailable" }, { status: 404 });

  return NextResponse.json({
    lineSpacing: printLineSpacingSchema.catch("normal").parse(data.line_spacing),
  });
}
