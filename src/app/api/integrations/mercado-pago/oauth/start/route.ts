import { NextResponse } from "next/server";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import {
  buildMercadoPagoAuthorizationUrl,
  createMercadoPagoOAuthSession,
  isMercadoPagoOAuthConfigured,
} from "@/server/payments/providers/mercado-pago-oauth";

const OAUTH_COOKIE = "pedeaqui_mp_oauth";

export async function GET(request: Request) {
  try {
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) return redirectToSettings(request, "store_required");
    if (!isMercadoPagoOAuthConfigured()) return redirectToSettings(request, "setup_required");

    const { session, challenge, cookieValue } = createMercadoPagoOAuthSession({
      organizationId: context.organizationId,
      storeId: context.storeId,
    });
    const response = NextResponse.redirect(buildMercadoPagoAuthorizationUrl({
      state: session.state,
      challenge,
    }));
    response.cookies.set(OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return redirectToSettings(request, "not_authorized");
  }
}

function redirectToSettings(request: Request, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/pagamentos?mercado_pago=${encodeURIComponent(status)}`, request.url));
}
