import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard", "/pedidos", "/pdv", "/producao", "/cardapio", "/clientes", "/equipe", "/configuracoes",
  "/caixa", "/conversas", "/crescimento", "/entregador", "/entregas", "/escala", "/estoque", "/financeiro",
  "/fiscal", "/fornecedores", "/compras", "/salao", "/acesso-negado", "/recurso-indisponivel",
];

function getSafeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function updateSession(request: NextRequest, forwardedHeaders = new Headers(request.headers)) {
  const nextResponse = () => NextResponse.next({ request: { headers: forwardedHeaders } });
  let response = nextResponse();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!url || !publishableKey) {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("error", "auth_unavailable");
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  try {
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = nextResponse();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data } = await supabase.auth.getClaims();
    const isAuthenticated = Boolean(data?.claims?.sub);
    if (!isAuthenticated && isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    if (isAuthenticated && pathname === "/login") {
      const returnPath = getSafeReturnPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(returnPath, request.url));
    }
    return response;
  } catch {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("error", "auth_unavailable");
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }
}
