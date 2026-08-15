import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export default async function Unit360ResolverPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  await PlatformAdminService.access();
  const admin = createAdminClient();
  const { data, error } = await admin.from("stores").select("organization_id").eq("id", storeId).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  redirect(`/platform/empresas/${data.organization_id}/unidades/${storeId}`);
}
