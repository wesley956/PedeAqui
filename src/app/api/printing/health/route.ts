import { NextResponse } from "next/server";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { PrintingSafetyService } from "@/server/printing/printing-safety-service";

const headers = { "cache-control": "private, no-store" };
export async function GET() {
  try {
    const context = await authorize(PERMISSIONS.PRINTING_VIEW);
    if (!context.storeId) return NextResponse.json({ error: "active_store_required" }, { status: 400, headers });
    return NextResponse.json(await PrintingSafetyService.load(context), { headers });
  } catch (error) {
    return NextResponse.json({ error: "printing_health_unavailable" }, {
      status: error instanceof AuthorizationError ? 403 : 503, headers,
    });
  }
}
