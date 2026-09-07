import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pedeaqui-pathname", request.nextUrl.pathname);
  return updateSession(request, requestHeaders);
}

export const config = {
  matcher: [
    // The public storefront (/m/...) is anonymous and must not pay the auth-proxy
    // cost on every menu, cart, checkout and product request. Authentication for
    // back-office routes remains unchanged.
    "/((?!m(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
