import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./shell.css";
import "./mobile.css";
import "./accessibility.css";

export const metadata: Metadata = {
  title: {
    default: "PedeAqui",
    template: "%s | PedeAqui",
  },
  description: "Gestão, pedidos e operação para estabelecimentos alimentícios.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
      <Script id="pedeaqui-theme" strategy="beforeInteractive">{`
        (() => {
          const key = "pedeaqui-theme";
          const root = document.documentElement;
          const systemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
          try {
            const preference = localStorage.getItem(key);
            const validPreference = preference === "light" || preference === "dark" || preference === "system" ? preference : "system";
            root.dataset.themePreference = validPreference;
            root.dataset.theme = validPreference === "system" ? systemTheme() : validPreference;
          } catch {
            root.dataset.themePreference = "system";
            root.dataset.theme = systemTheme();
          }
          window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (root.dataset.themePreference === "system") root.dataset.theme = systemTheme();
          });
        })();
      `}</Script>
    </html>
  );
}
