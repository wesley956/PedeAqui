import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  redirect(user ? "/dashboard" : "/login");
}
