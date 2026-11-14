import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const isGitHubPages = process.env.GITHUB_PAGES === "true";
// Homologação local (scripts/homologacao-local): só em desenvolvimento, libera o Supabase local e o acesso pela
// rede do computador. Em produção a variável é ignorada e a política de segurança fica exatamente como está.
const homologHost = isDevelopment ? process.env.PEDEAQUI_HOMOLOG_HOST?.trim() : undefined;
const homologValid = homologHost && /^[a-z0-9.-]+$/i.test(homologHost) ? homologHost : undefined;
const homologConnect = homologValid ? ` http://${homologValid}:54321 ws://${homologValid}:54321 http://127.0.0.1:54321 ws://127.0.0.1:54321` : "";
const homologImages = homologValid ? ` http://${homologValid}:54321 http://127.0.0.1:54321` : "";

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Embedded Signup uses a Meta popup and postMessage back to PedeAqui.
  // same-origin-allow-popups preserves opener communication without allowing
  // arbitrary cross-origin documents to join the same browsing context group.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline' https://connect.facebook.net${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https:${homologImages}`,
      "media-src 'self' https:",
      "font-src 'self' data:",
      `connect-src 'self' https: wss:${homologConnect}`,
      "frame-src 'self' https://www.facebook.com https://web.facebook.com",
    ].join("; "),
  },
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: "/cruz",
        assetPrefix: "/cruz/",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        experimental: {
          serverActions: {
            // The application caps each image at 4 MiB to stay below the Vercel
            // request limit; this envelope also covers multi-image local forms.
            bodySizeLimit: "16mb",
            ...(isDevelopment ? { allowedOrigins: ["*.app.github.dev", ...(homologValid ? [`${homologValid}:3000`, homologValid] : [])] } : {}),
          },
        },
      }),
  ...(isDevelopment && !isGitHubPages
    ? { allowedDevOrigins: ["*.app.github.dev", ...(homologValid ? [homologValid] : [])] }
    : {}),
  ...(!isGitHubPages
    ? {
        async redirects() {
          return [
            {
              source: "/m/loja-santa-rita-1",
              destination: "/m/dona-maria-salgados-e-porcoes",
              permanent: true,
            },
            {
              source: "/m/loja-santa-rita-1/:path*",
              destination: "/m/dona-maria-salgados-e-porcoes/:path*",
              permanent: true,
            },
          ];
        },
        async headers() {
          return [{ source: "/(.*)", headers: [...securityHeaders] }];
        },
      }
    : {}),
};

export default nextConfig;
