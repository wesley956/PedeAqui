import { redirect } from "next/navigation";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export default async function PlatformRestaurantResolver({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  await PlatformAdminService.access();
  redirect(`/platform/unidades/${storeId}`);
}
