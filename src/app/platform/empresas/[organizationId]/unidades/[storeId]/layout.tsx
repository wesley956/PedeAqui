import { ModuleSupportPanel } from "@/app/platform/module-support-panel";
import { SupportActionsPanel } from "@/app/platform/support-actions-panel";

export default async function Restaurant360Layout({ children, params }: { children: React.ReactNode; params: Promise<{ organizationId: string; storeId: string }> }) {
  const { organizationId, storeId } = await params;
  return <>{children}<ModuleSupportPanel organizationId={organizationId} storeId={storeId} /><SupportActionsPanel organizationId={organizationId} storeId={storeId} /></>;
}
