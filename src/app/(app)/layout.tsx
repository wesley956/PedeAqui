import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { MissingOrganizationError } from "@/server/access/context";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { BrandingReadService, type ResolvedBranding } from "@/server/platform/branding-read-service";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();
  let branding: ResolvedBranding;
  let navigationItems: Awaited<ReturnType<typeof NavigationAccessService.load>>["items"];
  let operationalContexts: Awaited<ReturnType<typeof NavigationAccessService.load>>["operationalContexts"];

  try {
    const navigationAccess = await NavigationAccessService.load();
    branding = await BrandingReadService.resolve(navigationAccess.context.organizationId);
    navigationItems = navigationAccess.items;
    operationalContexts = navigationAccess.operationalContexts;
  } catch (error) {
    if (error instanceof MissingOrganizationError) redirect("/onboarding");
    throw error;
  }

  return <AppShell email={user.email} branding={branding} navigationItems={navigationItems} operationalContexts={operationalContexts}>{children}</AppShell>;
}
