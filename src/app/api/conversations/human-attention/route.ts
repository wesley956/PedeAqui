import { NextResponse } from "next/server";
import { HumanAttentionAlertService } from "@/server/conversations/human-attention-alert-service";

export async function GET(request: Request) {
  try {
    const expectedStoreId = new URL(request.url).searchParams.get("storeId");
    const result = await HumanAttentionAlertService.snapshot(expectedStoreId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível conferir a fila." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
}
