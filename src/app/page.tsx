import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/server/auth/session";
import { StartRouteService } from "@/server/access/start-route-service";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  redirect(await StartRouteService.resolve());
}
