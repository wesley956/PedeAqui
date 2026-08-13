import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getAccessContext, MissingOrganizationError } from "@/server/access/context";
import { BrandingReadService } from "@/server/platform/branding-read-service";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();

  try {
    const context=await getAccessContext();
    const branding=await BrandingReadService.resolve(context.organizationId);
    return <AppShell email={user.email} branding={branding}>{children}</AppShell>;
  } catch (error) {
    if (error instanceof MissingOrganizationError) redirect("/onboarding");
    throw error;
  }
}
