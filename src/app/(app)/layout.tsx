import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getAccessContext, MissingOrganizationError } from "@/server/access/context";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();

  try {
    await getAccessContext();
  } catch (error) {
    if (error instanceof MissingOrganizationError) redirect("/onboarding");
    throw error;
  }

  return <AppShell email={user.email}>{children}</AppShell>;
}
