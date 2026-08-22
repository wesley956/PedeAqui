import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const isGitHubPages = process.env.GITHUB_PAGES === "true";

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
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
            ...(isDevelopment ? { allowedOrigins: ["*.app.github.dev"] } : {}),
          },
        },
      }),
  ...(isDevelopment && !isGitHubPages
    ? { allowedDevOrigins: ["*.app.github.dev"] }
    : {}),
  ...(!isGitHubPages
    ? {
        async headers() {
          return [{ source: "/(.*)", headers: [...securityHeaders] }];
        },
      }
    : {}),
};

export default nextConfig;
