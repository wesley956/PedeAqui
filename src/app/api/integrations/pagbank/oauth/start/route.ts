import { NextResponse } from "next/server";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import {
  buildPagBankAuthorizationUrl,
  createPagBankOAuthSession,
  isPagBankConnectConfigured,
} from "@/server/payments/providers/pagbank-connect";

const OAUTH_COOKIE = "pedeaqui_pagbank_oauth";

export async function GET(request: Request) {
  try {
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    if (!context.storeId) return redirectToSettings(request, "store_required");
    if (!isPagBankConnectConfigured()) return redirectToSettings(request, "setup_required");

    const { session, cookieValue } = createPagBankOAuthSession({
      organizationId: context.organizationId,
      storeId: context.storeId,
    });
    const response = NextResponse.redirect(buildPagBankAuthorizationUrl({ state: session.state }));
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
  return NextResponse.redirect(new URL(`/configuracoes/pagamentos?pagbank=${encodeURIComponent(status)}`, request.url));
}
