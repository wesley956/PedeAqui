import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { OrderAlertBackupService } from "@/server/orders/order-alert-backup-service";

const cursorSchema = z.string().regex(/^\d+$/).nullable();

export async function GET(request: Request) {
  try {
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    if (!context.storeId) return NextResponse.json({ error: "active_store_required" }, { status: 400 });

    const url = new URL(request.url);
    const rawCursor = url.searchParams.get("cursor");
    const cursor = cursorSchema.parse(rawCursor);
    const result = await OrderAlertBackupService.pollEvents({
      organization_id: context.organizationId,
      store_id: context.storeId,
    }, cursor);

    return NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
    }
    return NextResponse.json({ error: "order_alert_events_failed" }, { status: 500 });
  }
}
