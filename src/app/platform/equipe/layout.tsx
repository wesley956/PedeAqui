import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export default async function TeamOwnerLayout({ children }: { children: ReactNode }) {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") notFound();
  return children;
}
