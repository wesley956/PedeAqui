import { InboxIntelligenceService } from "@/server/conversations/inbox-intelligence-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");

  if (before && after) {
    return Response.json(
      { error: "Use somente uma direção de paginação por vez." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const page = await InboxIntelligenceService.loadMessagePage(conversationId, { before, after });
  return Response.json(page, { headers: { "Cache-Control": "no-store" } });
}
