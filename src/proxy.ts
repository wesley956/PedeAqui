import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pedeaqui-pathname", request.nextUrl.pathname);
  return updateSession(request, requestHeaders);
}

export const config = {
  matcher: [
    // Public storefront requests and Print Agent API traffic use their own
    // authentication boundaries and must not pay the Supabase session-proxy cost.
    // Back-office routes continue through updateSession unchanged.
    "/((?!m(?:/|$)|api/print-agent(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3)$).*)",
  ],
};
