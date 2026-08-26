import { HomeClientRedirect } from "@/components/navigation/home-client-redirect";
import { getAuthenticatedUser } from "@/server/auth/session";
import { StartRouteService } from "@/server/access/start-route-service";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  const href = user ? await StartRouteService.resolve() : "/login";

  return <HomeClientRedirect href={href} />;
}
