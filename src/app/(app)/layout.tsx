import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuthenticatedUser } from "@/server/auth/session";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser();
  return <AppShell email={user.email}>{children}</AppShell>;
}
