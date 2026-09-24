import { ConversationMediaService } from "@/server/conversations/conversation-media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string; mediaId: string }> },
) {
  const { conversationId, mediaId } = await params;
  try {
    const url = new URL(request.url);
    const signedUrl = await ConversationMediaService.signedUrl(conversationId, mediaId, url.searchParams.get("download") === "1");
    return Response.redirect(signedUrl, 307);
  } catch {
    return Response.json(
      { error: "Mídia indisponível ou sem permissão." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
