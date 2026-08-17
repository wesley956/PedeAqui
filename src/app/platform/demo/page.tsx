import { redirect } from "next/navigation";
import { PlatformCommercialOnboardingService } from "@/server/platform/platform-commercial-onboarding-service";

export const dynamic = "force-dynamic";

export default async function PlatformDemoPage() {
  const demo = await PlatformCommercialOnboardingService.ensureDemo();
  redirect(`/m/${demo.slug}`);
}
