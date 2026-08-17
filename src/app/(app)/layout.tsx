import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { buildUserGuideSteps } from "@/features/user-guide/guide-model";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { MissingOrganizationError } from "@/server/access/context";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { OperationHeaderService, type OperationHeaderData } from "@/server/access/operation-header-service";
import { UserGuideService } from "@/server/onboarding/user-guide-service";
import { BrandingReadService, type ResolvedBranding } from "@/server/platform/branding-read-service";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();
  let branding: ResolvedBranding;
  let operationHeader: OperationHeaderData;
  let navigationItems: Awaited<ReturnType<typeof NavigationAccessService.load>>["items"];
  let operationalContexts: Awaited<ReturnType<typeof NavigationAccessService.load>>["operationalContexts"];
  let roleKeys: Awaited<ReturnType<typeof NavigationAccessService.load>>["roleKeys"];

  try {
    const navigationAccess = await NavigationAccessService.load();
    [branding, operationHeader] = await Promise.all([
      BrandingReadService.resolve(navigationAccess.context.organizationId),
      OperationHeaderService.load(navigationAccess),
    ]);
    navigationItems = navigationAccess.items;
    operationalContexts = navigationAccess.operationalContexts;
    roleKeys = navigationAccess.roleKeys;
  } catch (error) {
    if (error instanceof MissingOrganizationError) redirect("/onboarding");
    throw error;
  }

  const userGuide = await UserGuideService.load(user.id);
  const guideSteps = buildUserGuideSteps(navigationItems, roleKeys);

  return (
    <AppShell
      email={user.email}
      branding={branding}
      navigationItems={navigationItems}
      operationalContexts={operationalContexts}
      operationHeader={operationHeader}
      userGuide={userGuide}
      guideSteps={guideSteps}
    >
      {children}
    </AppShell>
  );
}
