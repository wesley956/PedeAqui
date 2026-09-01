import { NextResponse } from "next/server";
import { getAccessContext } from "@/server/access/context";
import { productExperienceClientEvent } from "@/server/product-experience/contracts";
import { ProductExperienceService } from "@/server/product-experience/product-experience-service";

export async function POST(request: Request) {
  try {
    const context = await getAccessContext();
    const parsed = productExperienceClientEvent.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ accepted: false }, { status: 400 });
    await ProductExperienceService.capture(context, {
      ...parsed.data,
      source: "client",
    });
    // A valid event is accepted even if the optional sink is unavailable.
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }
}
