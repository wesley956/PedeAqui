import type { Metadata } from "next";
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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
