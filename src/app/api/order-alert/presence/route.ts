import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { OrderAlertBackupService } from "@/server/orders/order-alert-backup-service";

const schema = z.object({
  browserId: z.string().uuid(),
  active: z.boolean().default(true),
  soundEnabled: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    if (!context.storeId) return NextResponse.json({ error: "active_store_required" }, { status: 400 });
    const input = schema.parse(await request.json());
    await OrderAlertBackupService.setPanelPresence(context, input.browserId, input.active, input.soundEnabled);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    return NextResponse.json({ error: "presence_update_failed" }, { status: 500 });
  }
}
