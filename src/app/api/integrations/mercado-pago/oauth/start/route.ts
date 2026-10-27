import { NextResponse } from "next/server";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { mercadoPagoOAuthAppUrl } from "@/server/payments/mercado-pago-oauth-navigation";
import {
  buildMercadoPagoAuthorizationUrl,
  createMercadoPagoOAuthSession,
  isMercadoPagoOAuthConfigured,
} from "@/server/payments/providers/mercado-pago-oauth";

const OAUTH_COOKIE = "pedeaqui_mp_oauth";

export async function GET(request: Request) {
  try {
    // Start on the callback host so host-only login and OAuth cookies survive the round trip.
    if (isMercadoPagoOAuthConfigured()) {
      const startUrl = mercadoPagoOAuthAppUrl("/api/integrations/mercado-pago/oauth/start");
      const requestHost = ((request.headers.get("x-forwarded-host") ?? request.headers.get("host")
        ?? new URL(request.url).host).split(",")[0] ?? "").trim().toLowerCase();
      if (requestHost !== startUrl.host.toLowerCase()) return NextResponse.redirect(startUrl);
    }
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) return redirectToSettings("store_required");
    if (!isMercadoPagoOAuthConfigured()) return redirectToSettings("setup_required");

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
    return redirectToSettings("not_authorized");
  }
}

function redirectToSettings(status: string) {
  return NextResponse.redirect(mercadoPagoOAuthAppUrl(`/configuracoes/pagamentos?mercado_pago=${encodeURIComponent(status)}`));
}
